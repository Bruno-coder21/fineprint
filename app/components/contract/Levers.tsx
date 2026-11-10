import { EXIT_TYPES, TERM_DEFS, type TermKey } from "@shared/simulate";
import { IconMinus, IconPlus, IconRotate } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ContractTerm } from "./types";

interface LeversProps {
  terms: ContractTerm[];
  onPropose: (key: TermKey, proposedValue: string | null) => void;
  onOpenSection: (sectionIdx: number) => void;
}

const LEVERS: { key: TermKey; step: number; suffix: string }[] = [
  { key: "early_exit_value", step: 1, suffix: "" },
  { key: "notice_days", step: 15, suffix: " days" },
  { key: "renewal_increase_pct", step: 1, suffix: "%" },
  { key: "monthly_fee", step: 50, suffix: "" },
];

const EXIT_LABEL: Record<string, string> = {
  fixed: "flat fee",
  months_of_fee: "payments",
  percent_of_remaining: "% of what is left",
  all_remaining: "everything left",
  none: "nothing",
};

/** The negotiable numbers. Change one to see the ruler redraw. */
export function Levers({ terms, onPropose, onOpenSection }: LeversProps) {
  const byKey = new Map(terms.map((term) => [term.key, term]));
  const exitType = byKey.get("early_exit_type")?.value ?? "";
  const autoRenew = byKey.get("auto_renew");
  const hasProposal = terms.some((term) => term.proposedValue != null);
  const present = LEVERS.filter((lever) => byKey.has(lever.key));
  if (present.length === 0 && !autoRenew) return null;

  const labelFor = (key: TermKey) =>
    key === "early_exit_value" && (EXIT_TYPES as readonly string[]).includes(exitType)
      ? `Exit penalty (${EXIT_LABEL[exitType]})`
      : TERM_DEFS[key].label;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13.5rem,1fr))]">
        {present.map((lever) => {
          const term = byKey.get(lever.key)!;
          const written = Number(term.value);
          const proposed =
            term.proposedValue != null ? Number(term.proposedValue) : written;
          const changed = term.proposedValue != null && proposed !== written;
          const set = (next: number) =>
            onPropose(
              lever.key,
              next === written ? null : String(Math.max(0, next)),
            );
          return (
            <div
              key={lever.key}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition-colors",
                changed
                  ? "border-emerald-600/60 bg-emerald-500/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{labelFor(lever.key)}</span>
                {term.sectionIdx != null ? (
                  <button
                    type="button"
                    className="shrink-0 rounded border border-border px-1.5 py-px font-medium tabular-nums text-foreground hover:bg-muted"
                    onClick={() => onOpenSection(term.sectionIdx as number)}
                  >
                    {`§${term.sectionIdx}`}
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label={`Lower ${labelFor(lever.key)}`}
                  disabled={proposed <= 0}
                  onClick={() => set(proposed - lever.step)}
                >
                  <IconMinus className="size-3.5" />
                </Button>
                <span className="min-w-16 flex-1 text-center text-lg font-semibold tabular-nums">
                  {proposed.toLocaleString("en-US")}
                  <span className="text-sm font-normal text-muted-foreground">
                    {lever.suffix}
                  </span>
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label={`Raise ${labelFor(lever.key)}`}
                  onClick={() => set(proposed + lever.step)}
                >
                  <IconPlus className="size-3.5" />
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {changed ? (
                  <>
                    contract says{" "}
                    <span className="line-through">
                      {written.toLocaleString("en-US")}
                      {lever.suffix}
                    </span>
                  </>
                ) : (
                  "as written"
                )}
              </p>
            </div>
          );
        })}
        {autoRenew ? (
          <button
            type="button"
            onClick={() => {
              const written = autoRenew.value === "true";
              const proposed =
                autoRenew.proposedValue != null
                  ? autoRenew.proposedValue === "true"
                  : written;
              const next = !proposed;
              onPropose("auto_renew", next === written ? null : String(next));
            }}
            className={cn(
              "flex flex-col items-start justify-between gap-1.5 rounded-xl border px-3 py-2.5 text-start transition-colors",
              autoRenew.proposedValue != null
                ? "border-emerald-600/60 bg-emerald-500/5"
                : "border-border bg-card hover:bg-muted/50",
            )}
          >
            <span className="text-xs text-muted-foreground">Auto-renewal</span>
            <span className="text-lg font-semibold">
              {(autoRenew.proposedValue ?? autoRenew.value) === "true"
                ? "On"
                : "Off"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {autoRenew.proposedValue != null
                ? `contract says ${autoRenew.value === "true" ? "on" : "off"}`
                : "click to try it off"}
            </span>
          </button>
        ) : null}
      </div>
      {hasProposal ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 self-start px-2 text-xs text-muted-foreground"
          onClick={() => {
            for (const term of terms) {
              if (term.proposedValue != null) {
                onPropose(term.key as TermKey, null);
              }
            }
          }}
        >
          <IconRotate className="size-3.5" />
          Back to the contract as written
        </Button>
      ) : null}
    </div>
  );
}
