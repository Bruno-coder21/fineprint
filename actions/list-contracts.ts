import { defineAction } from "@agent-native/core/action";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { worstRisk, type Risk } from "../shared/domain.js";
import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "List the user's contracts, newest first, with a per-section risk strip for each.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const { contracts, sections, items } = schema;
    const rows = await getDb()
      .select({
        id: contracts.id,
        title: contracts.title,
        myParty: contracts.myParty,
        counterparty: contracts.counterparty,
        createdAt: contracts.createdAt,
      })
      .from(contracts)
      .where(eq(contracts.ownerEmail, ownerEmail))
      .orderBy(desc(contracts.createdAt))
      .limit(50);
    if (rows.length === 0) return { contracts: [] };

    const ids = rows.map((row) => row.id);
    const sectionRows = await getDb()
      .select({
        contractId: sections.contractId,
        idx: sections.idx,
        reviewed: sections.reviewed,
        chars: sql<number>`length(${sections.body})`,
      })
      .from(sections)
      .where(
        and(
          inArray(sections.contractId, ids),
          eq(sections.ownerEmail, ownerEmail),
        ),
      )
      .orderBy(asc(sections.idx))
      .limit(5000);
    const itemRows = await getDb()
      .select({
        contractId: items.contractId,
        sectionIdx: items.sectionIdx,
        risk: items.risk,
      })
      .from(items)
      .where(
        and(inArray(items.contractId, ids), eq(items.ownerEmail, ownerEmail)),
      )
      .limit(5000);

    return {
      contracts: rows.map((row) => {
        const own = itemRows.filter((item) => item.contractId === row.id);
        return {
          ...row,
          path: `/contracts/${row.id}`,
          itemCount: own.length,
          redCount: own.filter((item) => item.risk === "red").length,
          strip: sectionRows
            .filter((section) => section.contractId === row.id)
            .map((section) => ({
              idx: section.idx,
              chars: Number(section.chars),
              reviewed: section.reviewed === 1,
              risk: worstRisk(
                own
                  .filter((item) => item.sectionIdx === section.idx)
                  .map((item) => item.risk as Risk),
              ),
            })),
        };
      }),
    };
  },
});
