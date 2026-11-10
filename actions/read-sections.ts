import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  loadContract,
  loadSections,
  requireUser,
} from "../server/lib/contracts.js";

const MAX_CHARS = 14_000;

export default defineAction({
  description:
    "Read the exact text of a range of contract sections (inclusive). Read a few sections, pin what matters with add-items, then read the next range. Long ranges are cut off: continue from nextIdx.",
  schema: z.object({
    contractId: z.string().describe("Contract id"),
    fromIdx: z.coerce
      .number()
      .int()
      .min(0)
      .describe("First section number to read (the preamble is 0)"),
    toIdx: z.coerce
      .number()
      .int()
      .min(0)
      .describe("Last section number to read, inclusive"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    await loadContract(args.contractId, ownerEmail);
    const all = await loadSections(args.contractId, ownerEmail);
    const wanted = all.filter(
      (section) => section.idx >= args.fromIdx && section.idx <= args.toIdx,
    );
    const sections: { idx: number; heading: string; text: string }[] = [];
    let used = 0;
    for (const section of wanted) {
      if (sections.length > 0 && used + section.body.length > MAX_CHARS) break;
      sections.push({
        idx: section.idx,
        heading: section.heading,
        text: section.body,
      });
      used += section.body.length;
    }
    const last = sections[sections.length - 1]?.idx ?? args.fromIdx - 1;
    const total = all.length;
    return {
      sections,
      totalSections: total,
      nextIdx: last < total ? last + 1 : null,
    };
  },
});
