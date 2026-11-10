import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { TERM_KEYS } from "../shared/simulate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  authorOf,
  loadContract,
  requireUser,
} from "../server/lib/contracts.js";
import { normalizeTermValue } from "../server/lib/terms.js";

export default defineAction({
  description:
    'Adjust one simulator term. Pass proposedValue to model a negotiated change without touching what the contract says: the ruler then draws "as written" against "as proposed". Pass proposedValue null to drop the proposal. Pass value only to correct what the contract actually says.',
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    key: z.enum(TERM_KEYS).describe("Term key"),
    value: z
      .string()
      .optional()
      .describe("Corrected value of what the contract says"),
    proposedValue: z
      .string()
      .nullable()
      .optional()
      .describe("Value you want to negotiate for, or null to clear it"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const orgId = ctx?.orgId ?? null;
    await loadContract(args.contractId, ownerEmail);
    const { terms } = schema;
    if (args.value === undefined && args.proposedValue === undefined) {
      fail("Pass value or proposedValue.", { errorCode: "empty_patch" });
    }

    let value: string | undefined;
    if (args.value !== undefined) {
      const normalized = normalizeTermValue(args.key, args.value);
      if ("error" in normalized) {
        fail(normalized.error, { errorCode: "invalid_term" });
      }
      value = normalized.value;
    }
    let proposedValue: string | null | undefined;
    if (args.proposedValue !== undefined) {
      if (args.proposedValue === null || args.proposedValue.trim() === "") {
        proposedValue = null;
      } else {
        const normalized = normalizeTermValue(args.key, args.proposedValue);
        if ("error" in normalized) {
          fail(normalized.error, { errorCode: "invalid_term" });
        }
        proposedValue = normalized.value;
      }
    }

    const where = and(
      eq(terms.contractId, args.contractId),
      eq(terms.key, args.key),
      eq(terms.ownerEmail, ownerEmail),
    );
    const [existing] = await getDb()
      .select({ id: terms.id, value: terms.value })
      .from(terms)
      .where(where)
      .limit(1);

    if (!existing) {
      if (value === undefined) {
        fail(
          `The contract has no ${args.key} recorded yet. Pass value to set it.`,
          { errorCode: "term_missing", statusCode: 409 },
        );
      }
      await getDb()
        .insert(terms)
        .values({
          id: crypto.randomUUID(),
          contractId: args.contractId,
          key: args.key,
          value,
          proposedValue: proposedValue ?? null,
          author: authorOf(ctx),
          ownerEmail,
          orgId,
        });
    } else {
      const patch: Partial<typeof terms.$inferInsert> = {};
      if (value !== undefined) patch.value = value;
      if (proposedValue !== undefined) {
        // A proposal equal to the written value is not a proposal.
        patch.proposedValue =
          proposedValue === (value ?? existing.value) ? null : proposedValue;
      }
      await getDb().update(terms).set(patch).where(where);
    }

    const [saved] = await getDb()
      .select({
        key: terms.key,
        value: terms.value,
        proposedValue: terms.proposedValue,
      })
      .from(terms)
      .where(where)
      .limit(1);
    return saved;
  },
});
