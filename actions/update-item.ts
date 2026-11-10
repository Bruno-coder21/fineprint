import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { FAVORS, ITEM_STATUSES, RISKS } from "../shared/domain.js";
import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    'Change one pinned finding: its decision status ("ok" accepted, "negotiate" flagged to push back on, "open" undecided), risk, wording, or note. The quote cannot be changed.',
  schema: z.object({
    id: z.string().describe("Item id from get-contract"),
    status: z.enum(ITEM_STATUSES).optional().describe("open, ok, or negotiate"),
    risk: z.enum(RISKS).optional().describe("red, yellow, or green"),
    favors: z.enum(FAVORS).optional().describe("me, them, or both"),
    title: z.string().min(2).max(80).optional().describe("New label"),
    plain: z
      .string()
      .min(5)
      .max(320)
      .optional()
      .describe("New plain-language explanation"),
    note: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .describe("Note for the negotiation, or null to clear it"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const { items } = schema;
    const patch: Partial<typeof items.$inferInsert> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.risk !== undefined) patch.risk = args.risk;
    if (args.favors !== undefined) patch.favors = args.favors;
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.plain !== undefined) patch.plain = args.plain.trim();
    if (args.note !== undefined) patch.note = args.note?.trim() || null;
    if (Object.keys(patch).length === 0) {
      fail("Nothing to change.", { errorCode: "empty_patch" });
    }
    const [updated] = await getDb()
      .update(items)
      .set(patch)
      .where(and(eq(items.id, args.id), eq(items.ownerEmail, ownerEmail)))
      .returning({
        id: items.id,
        title: items.title,
        status: items.status,
        risk: items.risk,
      });
    if (!updated) {
      fail("Item not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return updated;
  },
});
