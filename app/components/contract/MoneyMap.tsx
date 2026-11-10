import {
  formatMoney,
  type Model,
  type Snapshot,
} from "@shared/simulate";

import { shortParty, type ContractTerm } from "./types";

interface MoneyMapProps {
  model: Model;
  snapshot: Snapshot;
  proposedSnapshot: Snapshot | null;
  terms: ContractTerm[];
  myParty: string;
  counterparty: string;
  currency: string;
  onOpenSection: (sectionIdx: number) => void;
}

interface Flow {
  key: string;
  when: string;
  amount: number;
  label: string;
  tone: "base" | "red" | "yellow";
  dashed: boolean;
  sectionIdx: number | null;
  note?: string | undefined;
}

const WIDTH = 720;
const NODE_W = 150;
const LANE_H = 38;
const TOP = 10;

const TONE_STROKE: Record<Flow["tone"], string> = {
  base: "hsl(var(--foreground))",
  red: "hsl(4 74% 50%)",
  yellow: "hsl(36 92% 46%)",
};

/** Who pays whom, and how much, at the month the ruler points to. */
export function MoneyMap({
  model,
  snapshot,
  proposedSnapshot,
  terms,
  myParty,
  counterparty,
  currency,
  onOpenSection,
}: MoneyMapProps) {
  const sectionOf = (key: string) =>
    terms.find((term) => term.key === key)?.sectionIdx ?? null;
  const money = (value: number) => formatMoney(value, currency);

  const flows: Flow[] = [];
  if (model.deposit > 0) {
    flows.push({
      key: "deposit",
      when: "At signing",
      amount: model.deposit,
      label: `${money(model.deposit)} deposit`,
      tone: "base",
      dashed: false,
      sectionIdx: sectionOf("deposit"),
    });
  }
  flows.push({
    key: "fee",
    when: "Every month",
    amount: snapshot.fee,
    label: `${money(snapshot.fee)} / month`,
    tone: "base",
    dashed: false,
    sectionIdx: sectionOf("monthly_fee"),
    note:
      snapshot.fee > model.monthlyFee
        ? `was ${money(model.monthlyFee)}`
        : undefined,
  });
  if (model.lateFee > 0) {
    flows.push({
      key: "late",
      when: "If one payment is late",
      amount: model.lateFee,
      label: `${money(model.lateFee)} late fee`,
      tone: "yellow",
      dashed: true,
      sectionIdx: sectionOf("late_fee"),
    });
  }
  flows.push({
    key: "exit",
    when: `If you leave at month ${formatMonth(snapshot.month)}`,
    amount: snapshot.walkAway,
    label: `${money(snapshot.walkAway)} to leave`,
    tone: "red",
    dashed: true,
    sectionIdx: sectionOf("early_exit_value") ?? sectionOf("early_exit_type"),
    note:
      proposedSnapshot &&
      Math.abs(proposedSnapshot.walkAway - snapshot.walkAway) > 0.5
        ? `${money(proposedSnapshot.walkAway)} proposed`
        : undefined,
  });

  const maxAmount = Math.max(...flows.map((flow) => flow.amount), 1);
  const height = TOP * 2 + flows.length * LANE_H;
  const x1 = NODE_W + 14;
  const x2 = WIDTH - NODE_W - 14;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Money flowing from ${myParty} to ${counterparty}`}
    >
      <defs>
        {(["base", "red", "yellow"] as const).map((tone) => (
          <marker
            key={tone}
            id={`fp-arrow-${tone}`}
            viewBox="0 0 10 10"
            refX="2"
            refY="5"
            markerWidth="13"
            markerHeight="13"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0 0L10 5L0 10z" fill={TONE_STROKE[tone]} />
          </marker>
        ))}
      </defs>

      <PartyNode x={0} height={height} label="You" name={shortParty(myParty)} />
      <PartyNode
        x={WIDTH - NODE_W}
        height={height}
        label="Them"
        name={shortParty(counterparty, 20)}
      />

      {flows.map((flow, index) => {
        const y = TOP + index * LANE_H + LANE_H / 2;
        const strokeWidth = flow.dashed
          ? 2.25
          : 1.5 + 3.5 * Math.sqrt(flow.amount / maxAmount);
        const clickable = flow.sectionIdx != null;
        return (
          <g
            key={flow.key}
            className={clickable ? "cursor-pointer" : undefined}
            onClick={() => {
              if (flow.sectionIdx != null) onOpenSection(flow.sectionIdx);
            }}
          >
            <rect
              x={x1 - 6}
              y={y - LANE_H / 2 + 2}
              width={x2 - x1 + 12}
              height={LANE_H - 4}
              rx={8}
              className="fill-transparent transition-colors hover:fill-muted/60"
            />
            <line
              x1={x1}
              x2={x2 - 12}
              y1={y + 8}
              y2={y + 8}
              stroke={TONE_STROKE[flow.tone]}
              strokeWidth={strokeWidth}
              strokeDasharray={flow.dashed ? "6 5" : undefined}
              strokeLinecap="butt"
              opacity={flow.tone === "base" ? 0.82 : 1}
              markerEnd={`url(#fp-arrow-${flow.tone})`}
              style={{ transition: "stroke-width 300ms ease-out" }}
            />
            <text
              x={x1 + 4}
              y={y - 6}
              className="fill-muted-foreground text-[11px]"
            >
              {flow.when}
              {flow.sectionIdx != null ? `  ·  §${flow.sectionIdx}` : ""}
            </text>
            <text
              x={x2 - 4}
              y={y - 6}
              textAnchor="end"
              className="text-[13px] font-semibold tabular-nums"
              fill={
                flow.tone === "base"
                  ? "hsl(var(--foreground))"
                  : TONE_STROKE[flow.tone]
              }
            >
              {flow.label}
              {flow.note ? (
                <tspan className="fill-muted-foreground text-[11px] font-normal">
                  {`  (${flow.note})`}
                </tspan>
              ) : null}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PartyNode({
  x,
  height,
  label,
  name,
}: {
  x: number;
  height: number;
  label: string;
  name: string;
}) {
  return (
    <g>
      <rect
        x={x + 1}
        y={8}
        width={NODE_W - 2}
        height={height - 16}
        rx={14}
        className="fill-card stroke-border"
        strokeWidth={1.5}
      />
      <text
        x={x + NODE_W / 2}
        y={height / 2 - 6}
        textAnchor="middle"
        className="fill-foreground text-[17px] font-semibold"
      >
        {label}
      </text>
      <text
        x={x + NODE_W / 2}
        y={height / 2 + 14}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px]"
      >
        {name}
      </text>
    </g>
  );
}

export function formatMonth(month: number): string {
  return Number.isInteger(month) ? String(month) : month.toFixed(1);
}
