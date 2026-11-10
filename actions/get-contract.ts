import { defineAction } from "@agent-native/core/action";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { worstRisk, type Risk } from "../shared/domain.js";
import { getDb, schema } from "../server/db/index.js";
import {
  loadContract,
  loadSections,
  requireUser,
} from "../server/lib/contracts.js";

export default defineAction({
  description:
    'Get one contract: parties, the numbered section outline with review status and risk, every pinned finding, and the simulator terms. view "outline" (default) omits section text; use read-sections to read text. view "full" includes all text and is meant for the page.',
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    view: z
      .enum(["outline", "full"])
      .default("outline")
      .describe('"outline" without section text, or "full" with it'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const contract = await loadContract(args.contractId, ownerEmail);
    const sectionRows = await loadSections(args.contractId, ownerEmail);
    const { items, terms } = schema;
    const itemRows = await getDb()
      .select({
        id: items.id,
        sectionIdx: items.sectionIdx,
        kind: items.kind,
        title: items.title,
        plain: items.plain,
        quote: items.quote,
        risk: items.risk,
        favors: items.favors,
        status: items.status,
        note: items.note,
        author: items.author,
      })
      .from(items)
      .where(
        and(
          eq(items.contractId, args.contractId),
          eq(items.ownerEmail, ownerEmail),
        ),
      )
      .orderBy(asc(items.sectionIdx), asc(items.createdAt))
      .limit(1000);
    const termRows = await getDb()
      .select({
        key: terms.key,
        value: terms.value,
        proposedValue: terms.proposedValue,
        sectionIdx: terms.sectionIdx,
        quote: terms.quote,
        author: terms.author,
      })
      .from(terms)
      .where(
        and(
          eq(terms.contractId, args.contractId),
          eq(terms.ownerEmail, ownerEmail),
        ),
      )
      .limit(100);

    const outline = sectionRows.map((section) => {
      const own = itemRows.filter((item) => item.sectionIdx === section.idx);
      return {
        idx: section.idx,
        heading: section.heading,
        chars: section.body.length,
        reviewed: section.reviewed === 1,
        itemCount: own.length,
        risk: worstRisk(own.map((item) => item.risk as Risk)),
        ...(args.view === "full" ? { body: section.body } : {}),
      };
    });

    return {
      contract: {
        id: contract.id,
        title: contract.title,
        myParty: contract.myParty,
        counterparty: contract.counterparty,
        currency: contract.currency,
        negotiationDraft: contract.negotiationDraft,
        createdAt: contract.createdAt,
      },
      coverage: {
        reviewed: outline.filter((section) => section.reviewed).length,
        total: outline.length,
      },
      sections: outline,
      items: itemRows,
      terms: termRows,
    };
  },
});
