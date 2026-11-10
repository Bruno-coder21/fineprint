import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { splitContract } from "../shared/split.js";
import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Import a contract from pasted text. Splits it into numbered sections and returns the new contractId. Does not analyze it: map it afterwards with read-sections, add-items, and set-terms.",
  schema: z.object({
    title: z.string().min(1).max(120).describe("Short name for the contract"),
    text: z
      .string()
      .min(200)
      .max(400_000)
      .describe("Full contract text, plain text"),
    myParty: z
      .string()
      .max(120)
      .optional()
      .describe('Which party the user is, e.g. "Tenant (Jordan Rivera)"'),
    counterparty: z
      .string()
      .max(120)
      .optional()
      .describe("The other party's name"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const orgId = ctx?.orgId ?? null;
    const parts = splitContract(args.text);
    if (parts.length === 0) {
      fail("The contract text is empty.", { errorCode: "empty_contract" });
    }
    const contractId = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.insert(schema.contracts).values({
        id: contractId,
        title: args.title.trim(),
        rawText: args.text,
        myParty: args.myParty?.trim() || "You",
        counterparty: args.counterparty?.trim() || "The other party",
        ownerEmail,
        orgId,
      });
      await tx.insert(schema.sections).values(
        parts.map((part) => ({
          id: crypto.randomUUID(),
          contractId,
          idx: part.idx,
          heading: part.heading,
          body: part.body,
          ownerEmail,
          orgId,
        })),
      );
    });
    return {
      id: contractId,
      title: args.title.trim(),
      sectionCount: parts.length,
      path: `/contracts/${contractId}`,
    };
  },
});
