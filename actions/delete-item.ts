import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description: "Remove one pinned finding from the contract map.",
  schema: z.object({ id: z.string().describe("Item id from get-contract") }),
  run: async ({ id }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const { items } = schema;
    const [removed] = await getDb()
      .delete(items)
      .where(and(eq(items.id, id), eq(items.ownerEmail, ownerEmail)))
      .returning({ id: items.id });
    if (!removed) {
      fail("Item not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return { id, deleted: true };
  },
});
