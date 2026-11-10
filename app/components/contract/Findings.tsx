import { KIND_LABEL, type ItemKind, type ItemStatus } from "@shared/domain";
import {
  IconCheck,
  IconMessageQuestion,
  IconScale,
  IconTrash,
  IconUser,
  IconSparkles,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  asRisk,
  asStatus,
  type ContractItem,
  type ContractSection,
} from "./types";

type Filter = "all" | "red" | "yellow" | "green" | "negotiate";

const RISK_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 };

interface FindingsProps {
  items: ContractItem[];
  sections: ContractSection[];
  selectedItemId: string | null;
  onOpenItem: (item: ContractItem) => void;
  onSetStatus: (item: ContractItem, status: ItemStatus) => void;
  onDelete: (item: ContractItem) => void;
  onAsk: (item: ContractItem) => void;
}

export function Findings({
  items,
  sections,
  selectedItemId,
  onOpenItem,
  onSetStatus,
  onDelete,
  onAsk,
}: FindingsProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(
    () => ({
      all: items.length,
      red: items.filter((item) => item.risk === "red").length,
      yellow: items.filter((item) => item.risk === "yellow").length,
      green: items.filter((item) => item.risk === "green").length,
      negotiate: items.filter((item) => item.status === "negotiate").length,
    }),
    [items],
  );
  const visible = useMemo(
    () =>
      items
        .filter((item) =>
          filter === "all"
            ? true
            : filter === "negotiate"
              ? item.status === "negotiate"
              : item.risk === filter,
        )
        .sort(
          (a, b) =>
            (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3) ||
            a.sectionIdx - b.sectionIdx,
        ),
    [items, filter],
  );
  const headingOf = (idx: number) =>
    sections.find((section) => section.idx === idx)?.heading ?? "";

  const filters: { id: Filter; label: string; risk?: string }[] = [
    { id: "all", label: "All" },
    { id: "red", label: "Watch out", risk: "red" },
    { id: "yellow", label: "Worth a look", risk: "yellow" },
    { id: "green", label: "Fine", risk: "green" },
    { id: "negotiate", label: "To negotiate" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter findings">
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            data-risk={entry.risk}
            onClick={() => setFilter(entry.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === entry.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.risk ? (
              <span className="size-2 rounded-full bg-[hsl(var(--risk))]" />
            ) : null}
            {entry.label}
            <span className="tabular-nums opacity-70">{counts[entry.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17.5rem,1fr))]">
          {visible.map((item) => {
            const status = asStatus(item.status);
            const kind = KIND_LABEL[item.kind as ItemKind] ?? "Note";
            return (
              <li
                key={item.id}
                data-risk={asRisk(item.risk)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow",
                  selectedItemId === item.id
                    ? "border-[hsl(var(--risk))] shadow-md"
                    : "border-border hover:shadow-sm",
                )}
              >
                <span className="absolute inset-y-0 left-0 w-1.5 bg-[hsl(var(--risk))]" />
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="flex flex-1 flex-col gap-1.5 py-3 pe-3 ps-5 text-start outline-none focus-visible:bg-muted/50"
                >
                  <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--risk))]">
                    {kind}
                    {item.favors === "them" ? (
                      <span className="rounded bg-[hsl(var(--risk-soft))] px-1.5 py-px normal-case tracking-normal">
                        favors them
                      </span>
                    ) : item.favors === "me" ? (
                      <span className="rounded bg-[hsl(var(--risk-soft))] px-1.5 py-px normal-case tracking-normal">
                        favors you
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm font-semibold leading-snug">
                    {item.title}
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">
                    {item.plain}
                  </span>
                  <span className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
                    <span className="rounded border border-border px-1.5 py-px font-medium tabular-nums text-foreground">
                      {`§${item.sectionIdx}`}
                    </span>
                    <span className="truncate">{headingOf(item.sectionIdx)}</span>
                    <span
                      className="ml-auto inline-flex shrink-0 items-center gap-1"
                      title={
                        item.author === "human"
                          ? "Pinned by you"
                          : "Pinned by the agent"
                      }
                    >
                      {item.author === "human" ? (
                        <IconUser className="size-3.5" />
                      ) : (
                        <IconSparkles className="size-3.5" />
                      )}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-1 border-t border-border/70 py-1.5 pe-2 ps-4">
                  <Button
                    type="button"
                    size="sm"
                    variant={status === "ok" ? "secondary" : "ghost"}
                    className="h-7 gap-1 px-2 text-xs"
                    aria-pressed={status === "ok"}
                    onClick={() => onSetStatus(item, status === "ok" ? "open" : "ok")}
                  >
                    <IconCheck className="size-3.5" />
                    OK with it
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={status === "negotiate" ? "default" : "ghost"}
                    className="h-7 gap-1 px-2 text-xs"
                    aria-pressed={status === "negotiate"}
                    onClick={() =>
                      onSetStatus(
                        item,
                        status === "negotiate" ? "open" : "negotiate",
                      )
                    }
                  >
                    <IconScale className="size-3.5" />
                    Negotiate
                  </Button>
                  <span className="ml-auto flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Ask the agent about ${item.title}`}
                      onClick={() => onAsk(item)}
                    >
                      <IconMessageQuestion className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => onDelete(item)}
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
