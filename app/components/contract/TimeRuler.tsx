import {
  dateAtMonth,
  formatMoney,
  type Simulation,
  type Snapshot,
} from "@shared/simulate";
import { useRef } from "react";

interface TimeRulerProps {
  simulation: Simulation;
  proposed: Simulation | null;
  startDate: string | null;
  month: number;
  currency: string;
  onMonthChange: (month: number) => void;
}

const W = 760;
const H = 262;
const LEFT = 52;
const RIGHT = 744;
const TOP = 58;
const BOTTOM = 214;

const RED = "hsl(4 74% 50%)";
const GREEN = "hsl(152 52% 36%)";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [year = 1970, month = 1] = iso.split("-").map(Number);
  const name = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name} '${String(year).slice(2)}`;
}

function compactMoney(value: number, currency: string): string {
  if (value >= 1000) {
    const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, "") || "$";
    const thousands = value / 1000;
    return `${symbol}${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  return formatMoney(value, currency);
}

/**
 * The time ruler. The grey area is what you are locked into if you stay; the
 * red line is what it costs to walk away that month. Drag to move through time.
 */
export function TimeRuler({
  simulation,
  proposed,
  startDate,
  month,
  currency,
  onMonthChange,
}: TimeRulerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const horizon = Math.max(simulation.horizon, 1);
  const allPoints = [...simulation.points, ...(proposed?.points ?? [])];
  const maxValue = Math.max(...allPoints.map((point) => point.committed), 1) * 1.08;

  const x = (value: number) => LEFT + (value / horizon) * (RIGHT - LEFT);
  const y = (value: number) => BOTTOM - (value / maxValue) * (BOTTOM - TOP);

  const linePath = (points: Snapshot[], pick: (point: Snapshot) => number) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${x(point.month).toFixed(1)} ${y(pick(point)).toFixed(1)}`,
      )
      .join(" ");
  const areaPath = (points: Snapshot[]) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return "";
    return `${linePath(points, (point) => point.committed)} L${x(last.month).toFixed(1)} ${BOTTOM} L${x(first.month).toFixed(1)} ${BOTTOM} Z`;
  };

  const current =
    simulation.points.reduce<Snapshot | null>(
      (best, point) =>
        !best || Math.abs(point.month - month) < Math.abs(best.month - month)
          ? point
          : best,
      null,
    ) ?? null;
  const currentProposed =
    proposed?.points.reduce<Snapshot | null>(
      (best, point) =>
        !best || Math.abs(point.month - month) < Math.abs(best.month - month)
          ? point
          : best,
      null,
    ) ?? null;

  function monthFromPointer(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return month;
    const px = ((clientX - rect.left) / rect.width) * W;
    const raw = ((px - LEFT) / (RIGHT - LEFT)) * horizon;
    return Math.min(horizon, Math.max(0, Math.round(raw * 2) / 2));
  }

  const tickEvery = horizon > 30 ? 6 : horizon > 14 ? 3 : horizon > 7 ? 2 : 1;
  const ticks: number[] = [];
  for (let tick = 0; tick <= horizon + 1e-6; tick += tickEvery) ticks.push(tick);
  const gridValues = [0.33, 0.66, 1].map((part) => (maxValue / 1.08) * part);
  const scrubX = x(Math.min(month, horizon));

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Cost over time"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          onMonthChange(monthFromPointer(event.clientX));
        }}
        onPointerMove={(event) => {
          if (dragging.current) onMonthChange(monthFromPointer(event.clientX));
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        style={{ cursor: "ew-resize" }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={LEFT}
              x2={RIGHT}
              y1={y(value)}
              y2={y(value)}
              className="stroke-border"
              strokeDasharray="2 5"
            />
            <text
              x={LEFT - 8}
              y={y(value) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {compactMoney(value, currency)}
            </text>
          </g>
        ))}
        <line
          x1={LEFT}
          x2={RIGHT}
          y1={BOTTOM}
          y2={BOTTOM}
          className="stroke-border"
        />

        <path
          d={areaPath(simulation.points)}
          className="fill-foreground/[0.09]"
        />
        <path
          d={linePath(simulation.points, (point) => point.committed)}
          fill="none"
          className="stroke-foreground/45"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {proposed ? (
          <path
            d={linePath(proposed.points, (point) => point.committed)}
            fill="none"
            stroke={GREEN}
            strokeOpacity={0.5}
            strokeWidth={1.25}
            strokeDasharray="3 4"
          />
        ) : null}
        <path
          d={linePath(simulation.points, (point) => point.walkAway)}
          fill="none"
          stroke={RED}
          strokeWidth={2.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {proposed ? (
          <path
            d={linePath(proposed.points, (point) => point.walkAway)}
            fill="none"
            stroke={GREEN}
            strokeWidth={2.75}
            strokeDasharray="7 5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {simulation.events.map((event, index) => {
          const ex = x(event.month);
          const row = index % 2;
          const anchor =
            ex > RIGHT - 110 ? "end" : ex < LEFT + 60 ? "start" : "middle";
          const deadline = event.kind === "deadline";
          return (
            <g key={`${event.kind}-${event.month}`}>
              <line
                x1={ex}
                x2={ex}
                y1={TOP - 14 + row * 15}
                y2={BOTTOM}
                stroke={deadline ? RED : "hsl(var(--muted-foreground))"}
                strokeOpacity={deadline ? 0.9 : 0.45}
                strokeDasharray="3 4"
              />
              <text
                x={ex + (anchor === "end" ? -5 : anchor === "start" ? 5 : 0)}
                y={TOP - 20 + row * 15}
                textAnchor={anchor}
                className="text-[10.5px] font-medium"
                fill={deadline ? RED : "hsl(var(--muted-foreground))"}
              >
                {event.label}
              </text>
            </g>
          );
        })}

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={BOTTOM}
              y2={BOTTOM + 4}
              className="stroke-border"
            />
            <text
              x={x(tick)}
              y={BOTTOM + 16}
              textAnchor={tick >= horizon - 1e-6 ? "end" : "middle"}
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {startDate ? shortDate(dateAtMonth(startDate, tick)) : `m${tick}`}
            </text>
          </g>
        ))}

        <g style={{ transition: dragging.current ? undefined : "transform 350ms ease-out" }} transform={`translate(${scrubX} 0)`}>
          <line
            x1={0}
            x2={0}
            y1={TOP - 26}
            y2={BOTTOM + 22}
            className="stroke-foreground"
            strokeWidth={1.5}
          />
          <rect
            x={-17}
            y={BOTTOM + 22}
            width={34}
            height={18}
            rx={9}
            className="fill-foreground"
          />
          <text
            x={0}
            y={BOTTOM + 34.5}
            textAnchor="middle"
            className="fill-background text-[10px] font-semibold tabular-nums"
          >
            {`m${Number.isInteger(month) ? month : month.toFixed(1)}`}
          </text>
          {current ? (
            <>
              <circle
                cx={0}
                cy={y(current.committed)}
                r={4}
                className="fill-background stroke-foreground/60"
                strokeWidth={1.5}
              />
              <circle
                cx={0}
                cy={y(current.walkAway)}
                r={5.5}
                fill={RED}
                className="stroke-background"
                strokeWidth={2}
              />
            </>
          ) : null}
          {currentProposed ? (
            <circle
              cx={0}
              cy={y(currentProposed.walkAway)}
              r={5.5}
              fill={GREEN}
              className="stroke-background"
              strokeWidth={2}
            />
          ) : null}
        </g>
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full" style={{ background: RED }} />
          Cost to walk away that month
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-foreground/40 bg-foreground/10" />
          Locked in if you stay
        </span>
        {proposed ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: GREEN }}
            />
            As you propose
          </span>
        ) : null}
        <span className="ml-auto">Drag the ruler to move through time</span>
      </div>
    </div>
  );
}
