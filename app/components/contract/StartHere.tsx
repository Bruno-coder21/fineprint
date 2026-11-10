import type { ItemStatus } from "@shared/domain";
import { IconArrowRight, IconScale } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

import { asStatus, type ContractItem } from "./types";

const KIND_PRIORITY: Record<string, number> = {
  renewal: 0,
  termination: 1,
  penalty: 2,
  payment: 3,
  liability: 4,
};

/** The red findings most likely to cost money, most important first. */
export function topRisks(items: ContractItem[], limit = 3): ContractItem[] {
  return items
    .filter((item) => item.risk === "red")
    .sort(
      (a, b) =>
        (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9) ||
        a.sectionIdx - b.sectionIdx,
    )
    .slice(0, limit);
}

interface StartHereProps {
  items: ContractItem[];
  onOpenItem: (item: ContractItem) => void;
  onSetStatus: (item: ContractItem, status: ItemStatus) => void;
}

/** If you read nothing else, read these. */
export function StartHere({ items, onOpenItem, onSetStatus }: StartHereProps) {
  const risks = topRisks(items);
  if (risks.length === 0) return null;
  return (
    <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {risks.map((item, index) => {
        const status = asStatus(item.status);
        return (
          <li
            key={item.id}
            data-risk="red"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--risk))] text-sm font-semibold text-white">
              {index + 1}
            </span>
            <span className="min-w-[14rem] flex-1">
              <span className="block text-[15px] font-semibold leading-snug">
                {item.title}
              </span>
              <span className="block text-sm leading-relaxed text-muted-foreground">
                {item.plain}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onOpenItem(item)}
              >
                {`Read §${item.sectionIdx}`}
                <IconArrowRight className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={status === "negotiate" ? "default" : "outline"}
                className="gap-1.5"
                aria-pressed={status === "negotiate"}
                onClick={() =>
                  onSetStatus(
                    item,
                    status === "negotiate" ? "open" : "negotiate",
                  )
                }
              >
                <IconScale className="size-3.5" />
                {status === "negotiate" ? "Negotiating" : "Negotiate"}
              </Button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
