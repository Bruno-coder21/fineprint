import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContract, requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Erase the map of a contract (all pinned findings, terms, review marks, and the negotiation draft) so it can be mapped again from scratch. The contract text is kept. Only do this when the user asks.",
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
        .update(sections)
        .set({ reviewed: 0 })
        .where(
          and(
            eq(sections.contractId, contractId),
            eq(sections.ownerEmail, ownerEmail),
          ),
        );
      await tx
        .update(contracts)
        .set({ negotiationDraft: null })
        .where(
          and(eq(contracts.id, contractId), eq(contracts.ownerEmail, ownerEmail)),
        );
    });
    return { contractId, cleared: true };
  },
});
