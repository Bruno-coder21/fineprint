import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Read what the user is looking at in Fineprint: the open contract, the month the time ruler points to, and the clause or finding open in the original-text panel. Basic navigation is already in <current-screen>; use this for a fresh read.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const navigation = (await readAppState("navigation")) as {
      view?: string;
      contractId?: string;
      month?: string;
      section?: string;
      itemId?: string;
    } | null;

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    if (navigation?.contractId && ctx?.userEmail) {
      const { contracts, items } = schema;
      const [contract] = await getDb()
        .select({
          id: contracts.id,
          title: contracts.title,
          myParty: contracts.myParty,
          counterparty: contracts.counterparty,
        })
        .from(contracts)
        .where(
          and(
            eq(contracts.id, navigation.contractId),
            eq(contracts.ownerEmail, ctx.userEmail),
          ),
        )
        .limit(1);
      if (contract) {
        screen.contract = contract;
        screen.rulerMonth = navigation.month ? Number(navigation.month) : 0;
        if (navigation.section) screen.openSection = Number(navigation.section);
        if (navigation.itemId) {
          const [item] = await getDb()
            .select({
              id: items.id,
              sectionIdx: items.sectionIdx,
              title: items.title,
              plain: items.plain,
              risk: items.risk,
              status: items.status,
            })
            .from(items)
            .where(
              and(
                eq(items.id, navigation.itemId),
                eq(items.ownerEmail, ctx.userEmail),
              ),
            )
            .limit(1);
          if (item) screen.openFinding = item;
        }
      }
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
