import { fail } from "@agent-native/core/action";
import { and, asc, eq } from "drizzle-orm";

import { findQuote } from "../../shared/quote.js";
import { getDb, schema } from "../db/index.js";

export interface CallerContext {
  userEmail?: string | null;
  orgId?: string | null;
  caller?: string;
}

export function requireUser(ctx: CallerContext | undefined): string {
  return (
    ctx?.userEmail ??
    fail("Sign in to work with contracts.", {
      errorCode: "unauthenticated",
      statusCode: 401,
    })
  );
}

/** Who made a change: a person in the UI, or the agent. */
export function authorOf(ctx: CallerContext | undefined): "human" | "agent" {
  return ctx?.caller === "frontend" || ctx?.caller === "http"
    ? "human"
    : "agent";
}

export async function loadContract(contractId: string, ownerEmail: string) {
  const { contracts } = schema;
  const [contract] = await getDb()
    .select()
    .from(contracts)
    .where(
      and(eq(contracts.id, contractId), eq(contracts.ownerEmail, ownerEmail)),
    )
    .limit(1);
  if (!contract) {
    fail("Contract not found.", { errorCode: "not_found", statusCode: 404 });
  }
  return contract;
}

export async function loadSections(contractId: string, ownerEmail: string) {
  const { sections } = schema;
  return getDb()
    .select({
      idx: sections.idx,
      heading: sections.heading,
      body: sections.body,
      reviewed: sections.reviewed,
    })
    .from(sections)
    .where(
      and(
        eq(sections.contractId, contractId),
        eq(sections.ownerEmail, ownerEmail),
      ),
    )
    .orderBy(asc(sections.idx))
    .limit(400);
}

export interface SectionText {
  idx: number;
  body: string;
}

export interface LocatedQuote {
  sectionIdx: number;
  /** The quote exactly as it appears in the contract. */
  quote: string;
}

/**
 * The rule that keeps the map honest: a quote must appear verbatim in the
 * contract. Looks in the named section first, then anywhere in the contract
 * (correcting the section number), and returns null when it is not there.
 */
export function locateQuote(
  sections: SectionText[],
  sectionIdx: number | null | undefined,
  quote: string,
): LocatedQuote | null {
  const preferred = sections.find((section) => section.idx === sectionIdx);
  const ordered = preferred
    ? [preferred, ...sections.filter((section) => section !== preferred)]
    : sections;
  for (const section of ordered) {
    const range = findQuote(section.body, quote);
    if (range) {
      return {
        sectionIdx: section.idx,
        quote: section.body.slice(range.start, range.end),
      };
    }
  }
  return null;
}
