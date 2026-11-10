import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  isModelReady,
  modelFromTerms,
  simulate,
  snapshotAt,
  TERM_KEYS,
  type Model,
} from "../shared/simulate.js";
import { getDb, schema } from "../server/db/index.js";
import { loadContract, requireUser } from "../server/lib/contracts.js";

function summarize(model: Model, month: number) {
  const simulation = simulate(model, 1);
  return {
    model,
    at: snapshotAt(model, Math.min(month, simulation.horizon)),
    cheapestExit: simulation.cheapestExit,
    autoRenewalTrap: simulation.trap,
    keyDates: simulation.events,
    totalIfYouStayTheInitialTerm: simulation.totalIfYouStay,
  };
}

export default defineAction({
  description:
    'Compute what the contract costs at a given month: paid so far, what the user is still locked into, the cost to walk away that month (penalty plus notice-period payments), the cheapest month to leave, and the auto-renewal trap. Returns the contract "asWritten" and, when any term has a proposed value, "asProposed" with the saving. When you pass a month, the time ruler on the user\'s screen also moves to that month, so they see what you are describing. Always use this for money or date math instead of calculating yourself.',
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    month: z.coerce
      .number()
      .min(0)
      .max(600)
      .optional()
      .describe(
        "Months since the start date, e.g. 8 for the end of month 8. Omit for the start.",
      ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const contract = await loadContract(args.contractId, ownerEmail);
    const { terms } = schema;
    const rows = await getDb()
      .select({
        key: terms.key,
        value: terms.value,
        proposedValue: terms.proposedValue,
      })
      .from(terms)
      .where(
        and(
          eq(terms.contractId, args.contractId),
          eq(terms.ownerEmail, ownerEmail),
        ),
      )
      .limit(100);

    const written = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const proposed = Object.fromEntries(
      rows.map((row) => [row.key, row.proposedValue ?? row.value]),
    );
    const model = modelFromTerms(written);
    if (!isModelReady(model)) {
      return {
        ready: false as const,
        missing: TERM_KEYS.filter((key) => !(key in written)),
        message:
          "The simulator needs at least term_months and monthly_fee. Record them with set-terms.",
      };
    }
    const month = args.month ?? 0;
    const asWritten = summarize(model, month);
    const hasProposal = rows.some((row) => row.proposedValue != null);
    const asProposed = hasProposal
      ? summarize(modelFromTerms(proposed), month)
      : null;
    // When the agent asks about a specific month, show it: point the ruler
    // on the user's screen at the same month the numbers are for.
    let rulerMoved = false;
    if (ctx?.caller === "tool" && args.month !== undefined) {
      try {
        await writeAppStateForCurrentTab("navigate", {
          view: "contracts",
          contractId: args.contractId,
          path: `/contracts/${encodeURIComponent(args.contractId)}?tab=costs&m=${asWritten.at.month}`,
          _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
        rulerMoved = true;
      } catch {
        rulerMoved = false;
      }
    }

    return {
      ready: true as const,
      currency: contract.currency,
      month,
      rulerMoved,
      asWritten,
      asProposed,
      walkAwaySavingIfProposalAccepted: asProposed
        ? asWritten.at.walkAway - asProposed.at.walkAway
        : null,
    };
  },
});
