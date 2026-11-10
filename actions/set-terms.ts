import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { TERM_KEYS } from "../shared/simulate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  authorOf,
  loadContract,
  loadSections,
  locateQuote,
  requireUser,
} from "../server/lib/contracts.js";
import { normalizeTermValue } from "../server/lib/terms.js";

export default defineAction({
  description:
    "Record the contract's numbers that drive the time ruler and exit-cost simulator, each backed by a verbatim quote. Keys: start_date (YYYY-MM-DD), term_months, monthly_fee, deposit, notice_days, early_exit_type (fixed | months_of_fee | percent_of_remaining | all_remaining | none), early_exit_value (the fee, the number of months, or the percent), auto_renew (true/false), renewal_term_months, renewal_increase_pct, late_fee. A term whose quote is not found word for word is rejected. Can also record who the parties are.",
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    terms: z
      .array(
        z.object({
          key: z.enum(TERM_KEYS).describe("Term key"),
          value: z
            .string()
            .describe(
              "Value as plain text: a number without currency symbols, a YYYY-MM-DD date, true/false, or an exit type",
            ),
          sectionIdx: z.coerce
            .number()
            .int()
            .min(0)
            .describe("Section number the quote comes from"),
          quote: z
            .string()
            .min(12)
            .max(600)
            .describe("Text copied word for word that states this value"),
        }),
      )
      .max(20)
      .default([])
      .describe("Terms to record or replace"),
    myParty: z
      .string()
      .max(120)
      .optional()
      .describe('Which party the user is, e.g. "Tenant (Jordan Rivera)"'),
    counterparty: z.string().max(120).optional().describe("The other party"),
    currency: z
      .string()
      .length(3)
      .optional()
      .describe("ISO currency code, e.g. USD or BRL"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const orgId = ctx?.orgId ?? null;
    await loadContract(args.contractId, ownerEmail);
    const sectionRows = await loadSections(args.contractId, ownerEmail);
    const { terms, contracts } = schema;
    const author = authorOf(ctx);

    const saved: { key: string; value: string; sectionIdx: number }[] = [];
    const rejected: { key: string; reason: string }[] = [];
    const rows: (typeof terms.$inferInsert)[] = [];
    for (const term of args.terms) {
      const normalized = normalizeTermValue(term.key, term.value);
      if ("error" in normalized) {
        rejected.push({ key: term.key, reason: normalized.error });
        continue;
      }
      const located = locateQuote(sectionRows, term.sectionIdx, term.quote);
      if (!located) {
        rejected.push({
          key: term.key,
          reason:
            "Quote not found word for word in the contract. Copy the exact text from read-sections.",
        });
        continue;
      }
      rows.push({
        id: crypto.randomUUID(),
        contractId: args.contractId,
        key: term.key,
        value: normalized.value,
        sectionIdx: located.sectionIdx,
        quote: located.quote,
        author,
        ownerEmail,
        orgId,
      });
      saved.push({
        key: term.key,
        value: normalized.value,
        sectionIdx: located.sectionIdx,
      });
    }

    if (args.terms.length > 0 && rows.length === 0) {
      fail(
        `No term was saved. ${rejected
          .map((entry) => `${entry.key}: ${entry.reason}`)
          .join(" ")}`,
        { errorCode: "terms_rejected", statusCode: 422, details: { rejected } },
      );
    }

    const contractPatch: Partial<typeof contracts.$inferInsert> = {};
    if (args.myParty?.trim()) contractPatch.myParty = args.myParty.trim();
    if (args.counterparty?.trim())
      contractPatch.counterparty = args.counterparty.trim();
    if (args.currency) contractPatch.currency = args.currency.toUpperCase();

    await getDb().transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(terms)
          .values(row)
          .onConflictDoUpdate({
            target: [terms.contractId, terms.key],
            set: {
              value: row.value,
              sectionIdx: row.sectionIdx,
              quote: row.quote,
              author: row.author,
            },
          });
      }
      if (Object.keys(contractPatch).length > 0) {
        await tx
          .update(contracts)
          .set(contractPatch)
          .where(
            and(
              eq(contracts.id, args.contractId),
              eq(contracts.ownerEmail, ownerEmail),
            ),
          );
      }
    });

    return { saved, rejected };
  },
});
