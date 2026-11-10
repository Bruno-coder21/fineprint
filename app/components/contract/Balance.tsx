import { RISK_WEIGHT } from "@shared/domain";

import { asRisk, shortParty, type ContractItem } from "./types";

/** A small scale: which way do the one-sided clauses tip? */
export function Balance({
  items,
  counterparty,
}: {
  items: ContractItem[];
  counterparty: string;
}) {
  let mine = 0;
  let theirs = 0;
  let mineCount = 0;
  let theirsCount = 0;
  for (const item of items) {
    const risk = asRisk(item.risk);
    const weight = risk === "none" ? 1 : RISK_WEIGHT[risk];
    if (item.favors === "me") {
      mine += weight;
      mineCount += 1;
    } else if (item.favors === "them") {
      theirs += weight;
      theirsCount += 1;
    }
  }
  const total = mine + theirs;
  if (total === 0) return null;
  const tilt = ((theirs - mine) / total) * 14;
  const them = shortParty(counterparty, 20);
  const verdict =
    Math.abs(theirs - mine) / total < 0.15
      ? "Roughly balanced"
      : theirs > mine
        ? `Tilts toward ${them}`
        : "Tilts toward you";

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 120 64" className="h-14 w-[6.5rem] shrink-0" aria-hidden>
        <path d="M60 22 L50 58 H70 Z" className="fill-muted stroke-border" />
        <g
          transform={`rotate(${tilt} 60 22)`}
          style={{ transition: "transform 700ms cubic-bezier(.3,1.4,.5,1)" }}
        >
          <rect x={10} y={20} width={100} height={4} rx={2} className="fill-foreground" />
          <circle cx={22} cy={22} r={10} fill="hsl(152 52% 36%)" opacity={0.9} />
          <circle cx={98} cy={22} r={10} fill="hsl(4 74% 50%)" opacity={0.9} />
          <text x={22} y={25.5} textAnchor="middle" className="fill-white text-[10px] font-bold">
            {mineCount}
          </text>
          <text x={98} y={25.5} textAnchor="middle" className="fill-white text-[10px] font-bold">
            {theirsCount}
          </text>
        </g>
        <circle cx={60} cy={22} r={3} className="fill-background stroke-foreground" strokeWidth={1.5} />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{verdict}</p>
        <p className="text-xs text-muted-foreground">
          {theirsCount} clause{theirsCount === 1 ? "" : "s"} favor them,{" "}
          {mineCount} favor you
        </p>
      </div>
    </div>
  );
}
