import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { FAVORS, ITEM_KINDS, RISKS } from "../shared/domain.js";
import { getDb, schema } from "../server/db/index.js";
import {
  authorOf,
  loadContract,
  loadSections,
  locateQuote,
  requireUser,
} from "../server/lib/contracts.js";

const itemSchema = z.object({
  sectionIdx: z.coerce
    .number()
    .int()
    .min(0)
    .describe("Number of the section the quote comes from"),
  kind: z
    .enum(ITEM_KINDS)
    .describe(
      "payment, deadline, obligation (user must), right (user may), penalty, renewal, termination, liability, or other",
    ),
  title: z.string().min(2).max(80).describe("Label of at most 8 words"),
  plain: z
    .string()
    .min(5)
    .max(320)
    .describe(
      'What it means for the user in plain language, addressed as "you", with the concrete number or date',
    ),
  quote: z
    .string()
    .min(12)
    .max(600)
    .describe(
      "Text copied word for word from the section that proves this item. One clause or sentence. It is rejected if it is not found verbatim.",
    ),
  risk: z
    .enum(RISKS)
    .describe(
      "red = can cost the user real money or rights, or is one-sided; yellow = unusual or worth negotiating; green = standard or protects the user",
    ),
  favors: z
    .enum(FAVORS)
    .default("both")
    .describe('Who the clause favors: "me" (the user), "them", or "both"'),
});

export default defineAction({
  description:
    "Pin findings onto the contract map. Every item needs a verbatim quote from the contract; an item whose quote is not found word for word is rejected and not saved. Also marks sections as reviewed so the heat strip fills in. Call it after each read-sections range, not once at the end.",
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    items: z.array(itemSchema).max(40).default([]).describe("Findings to pin"),
    reviewedSectionIdxs: z
      .array(z.coerce.number().int().min(0))
      .max(400)
      .default([])
      .describe(
        "Every section number you have fully read, including ones with nothing worth pinning",
      ),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const orgId = ctx?.orgId ?? null;
    await loadContract(args.contractId, ownerEmail);
    const sectionRows = await loadSections(args.contractId, ownerEmail);
    const { items, sections } = schema;

    const existing = await getDb()
      .select({ sectionIdx: items.sectionIdx, quote: items.quote })
      .from(items)
      .where(
        and(
          eq(items.contractId, args.contractId),
          eq(items.ownerEmail, ownerEmail),
        ),
      )
      .limit(2000);
    const seen = new Set(
      existing.map((item) => `${item.sectionIdx}:${item.quote}`),
    );

    const author = authorOf(ctx);
    const accepted: (typeof items.$inferInsert)[] = [];
    const rejected: { index: number; title: string; reason: string }[] = [];
    args.items.forEach((item, index) => {
      const located = locateQuote(sectionRows, item.sectionIdx, item.quote);
      if (!located) {
        rejected.push({
          index,
          title: item.title,
          reason:
            "Quote not found word for word in the contract. Copy the exact text from read-sections.",
        });
        return;
      }
      const key = `${located.sectionIdx}:${located.quote}`;
      if (seen.has(key)) {
        rejected.push({
          index,
          title: item.title,
          reason: "Already pinned with this quote.",
        });
        return;
      }
      seen.add(key);
      accepted.push({
        id: crypto.randomUUID(),
        contractId: args.contractId,
        sectionIdx: located.sectionIdx,
        kind: item.kind,
        title: item.title.trim(),
        plain: item.plain.trim(),
        quote: located.quote,
        risk: item.risk,
        favors: item.favors,
        author,
        ownerEmail,
        orgId,
      });
    });

    if (args.items.length > 0 && accepted.length === 0) {
      fail(
        `Nothing was pinned. ${rejected
          .map((entry) => `"${entry.title}": ${entry.reason}`)
          .join(" ")}`,
        {
          errorCode: "quote_not_found",
          statusCode: 422,
          details: { rejected },
        },
      );
    }

    const reviewedIdxs = [
      ...new Set([
        ...args.reviewedSectionIdxs,
        ...accepted.map((item) => item.sectionIdx as number),
      ]),
    ];
    await getDb().transaction(async (tx) => {
      if (accepted.length > 0) await tx.insert(items).values(accepted);
      if (reviewedIdxs.length > 0) {
        await tx
          .update(sections)
          .set({ reviewed: 1 })
          .where(
            and(
              eq(sections.contractId, args.contractId),
              eq(sections.ownerEmail, ownerEmail),
              inArray(sections.idx, reviewedIdxs),
            ),
          );
      }
    });

    const reviewedBefore = sectionRows
      .filter((section) => section.reviewed === 1)
      .map((section) => section.idx);
    const reviewedNow = new Set([...reviewedBefore, ...reviewedIdxs]);
    return {
      added: accepted.map((item) => ({
        id: item.id,
        sectionIdx: item.sectionIdx,
        title: item.title,
        risk: item.risk,
      })),
      rejected,
      coverage: {
        reviewed: sectionRows.filter((section) => reviewedNow.has(section.idx))
          .length,
        total: sectionRows.length,
      },
    };
  },
});
