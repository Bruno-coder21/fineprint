import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContract, requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Save the negotiation message for a contract. It appears in the Negotiate panel, where the user can edit and copy it. Write it from the items marked negotiate and the proposed terms; cite section numbers; keep it short and courteous. Pass an empty body to clear it.",
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    body: z
      .string()
      .max(8000)
      .describe("Full text of the negotiation message, plain text"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    await loadContract(args.contractId, ownerEmail);
    const { contracts } = schema;
    const body = args.body.trim();
    await getDb()
      .update(contracts)
      .set({ negotiationDraft: body || null })
      .where(
        and(
          eq(contracts.id, args.contractId),
          eq(contracts.ownerEmail, ownerEmail),
        ),
      );
    return { contractId: args.contractId, saved: true, length: body.length };
  },
});
