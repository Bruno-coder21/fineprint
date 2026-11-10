import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContract, requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Permanently delete a contract and its whole map. Only do this when the user asks.",
  schema: z.object({ contractId: z.string().describe("Contract id") }),
  // Destructive, so it is a button for people only. The agent reads untrusted
  // contract text; it must not be talked into erasing anything.
  agentTool: false,
  run: async ({ contractId }, ctx) => {
    const ownerEmail = requireUser(ctx);
    await loadContract(contractId, ownerEmail);
    const { contracts, items, sections, terms } = schema;
    await getDb().transaction(async (tx) => {
      await tx
        .delete(items)
        .where(
          and(eq(items.contractId, contractId), eq(items.ownerEmail, ownerEmail)),
        );
      await tx
        .delete(terms)
        .where(
          and(eq(terms.contractId, contractId), eq(terms.ownerEmail, ownerEmail)),
        );
      await tx
        .delete(sections)
        .where(
          and(
            eq(sections.contractId, contractId),
            eq(sections.ownerEmail, ownerEmail),
          ),
        );
      await tx
        .delete(contracts)
        .where(
          and(eq(contracts.id, contractId), eq(contracts.ownerEmail, ownerEmail)),
        );
    });
    return { contractId, deleted: true };
  },
});
