import {
  formatDate,
  formatMoney,
  type Model,
  type Simulation,
  type Snapshot,
} from "@shared/simulate";

import { cn } from "@/lib/utils";

import type { ContractTerm } from "./types";

interface AtAGlanceProps {
  model: Model;
  simulation: Simulation;
  start: Snapshot;
  terms: ContractTerm[];
  currency: string;
  onOpenSection: (sectionIdx: number) => void;
  onSeeCosts: () => void;
}

interface Fact {
  key: string;
  label: string;
  value: string;
  detail: string;
  termKey: string;
  tone?: "red";
}

const EXIT_RULE: Record<string, (value: number, money: string) => string> = {
  fixed: (_value, money) => `${money} flat fee`,
  months_of_fee: (value) => `${value} extra payment${value === 1 ? "" : "s"}`,
  percent_of_remaining: (value) => `${value}% of what is left`,
  all_remaining: () => "everything left is owed",
  none: () => "no penalty",
};

/** The five things anyone asks first about a contract. */
export function AtAGlance({
  model,
  simulation,
  start,
  terms,
  currency,
  onOpenSection,
  onSeeCosts,
}: AtAGlanceProps) {
  const money = (value: number) => formatMoney(value, currency);
  const sectionOf = (key: string) =>
    terms.find((term) => term.key === key)?.sectionIdx ?? null;

  const facts: Fact[] = [
    {
      key: "length",
      label: "How long",
      value: `${model.termMonths} months`,
      detail: model.startDate
        ? `starts ${formatDate(model.startDate)}`
        : "from the start date",
      termKey: "term_months",
    },
    {
      key: "pay",
      label: "What you pay",
      value: `${money(model.monthlyFee)} / month`,
      detail: `${money(simulation.totalIfYouStay)} over the term${model.deposit > 0 ? ", deposit included" : ""}`,
      termKey: "monthly_fee",
    },
  ];
  if (model.deposit > 0) {
    facts.push({
      key: "deposit",
      label: "Up front",
      value: money(model.deposit),
      detail: "deposit at signing",
      termKey: "deposit",
    });
  }
  facts.push({
    key: "exit",
    label: "To leave early",
    value: money(start.walkAway),
    detail: [
      EXIT_RULE[model.exitType]?.(model.exitValue, money(model.exitValue)),
      model.noticeDays > 0 ? `${model.noticeDays} days notice` : null,
    ]
      .filter(Boolean)
      .join(" + "),
    termKey: "early_exit_value",
    tone: start.walkAway > model.monthlyFee * 1.5 ? "red" : undefined,
  } as Fact);
  facts.push({
    key: "renewal",
    label: "When it ends",
    value: model.autoRenew
      ? `Renews by itself${model.renewalIncreasePct ? `, +${model.renewalIncreasePct}%` : ""}`
      : "Ends, no auto-renewal",
    detail:
      model.autoRenew && simulation.trap
        ? `say no by ${simulation.trap.date ? formatDate(simulation.trap.date) : `month ${simulation.trap.month}`}`
        : "nothing to cancel",
    termKey: "auto_renew",
    tone: model.autoRenew ? "red" : undefined,
  } as Fact);

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        {facts.map((fact) => {
          const sectionIdx = sectionOf(fact.termKey);
          return (
            <div key={fact.key} className="flex flex-col gap-1 bg-card px-4 py-3.5">
              <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                {fact.label}
                {sectionIdx != null ? (
                  <button
                    type="button"
                    onClick={() => onOpenSection(sectionIdx)}
                    className="rounded border border-border px-1.5 py-px font-medium tabular-nums text-foreground hover:bg-muted"
                    aria-label={`Read section ${sectionIdx}`}
                  >
                    {`§${sectionIdx}`}
                  </button>
                ) : null}
              </dt>
              <dd
                className={cn(
                  "text-lg font-semibold leading-tight tracking-tight",
                  fact.tone === "red" && "text-[hsl(4_74%_50%)]",
                )}
              >
                {fact.value}
              </dd>
              <dd className="text-xs text-muted-foreground">{fact.detail}</dd>
            </div>
          );
        })}
      </dl>
      <button
        type="button"
        onClick={onSeeCosts}
        className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        These numbers change over time. See what it costs month by month
      </button>
    </div>
  );
}
