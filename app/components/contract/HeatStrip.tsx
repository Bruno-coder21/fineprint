import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { asRisk, type ContractSection } from "./types";

interface HeatStripProps {
  sections: Pick<
    ContractSection,
    "idx" | "heading" | "chars" | "reviewed" | "risk" | "itemCount"
  >[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  className?: string;
}

/**
 * The whole contract as one column: every clause is a block, sized by its
 * length and painted by its worst finding. Unread clauses stay hatched.
 */
export function HeatStrip({
  sections,
  selectedIdx,
  onSelect,
  className,
}: HeatStripProps) {
  return (
    <nav
      aria-label="Contract heat map"
      className={cn("flex h-full min-h-0 flex-col gap-[3px]", className)}
    >
      {sections.map((section) => {
        const risk = asRisk(section.risk);
        const selected = section.idx === selectedIdx;
        return (
          <Tooltip key={section.idx}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-risk={risk}
                onClick={() => onSelect(section.idx)}
                aria-label={`Section ${section.idx}: ${section.heading}`}
                aria-current={selected ? "true" : undefined}
                style={{ flexGrow: Math.max(section.chars, 140) }}
                className={cn(
                  "group relative min-h-[7px] w-full basis-0 rounded-[3px] outline-none transition-[background-color,box-shadow,transform] duration-700 ease-out focus-visible:ring-2 focus-visible:ring-ring",
                  !section.reviewed && "fineprint-unread bg-muted/60",
                  section.reviewed &&
                    risk === "none" &&
                    "bg-[hsl(var(--risk)/0.45)]",
                  section.reviewed && risk !== "none" && "bg-[hsl(var(--risk))]",
                  selected
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-1 hover:ring-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-1.5 hidden items-center text-[10px] font-semibold tabular-nums group-hover:flex",
                    section.reviewed && risk !== "none"
                      ? "text-white"
                      : "text-muted-foreground",
                  )}
                >
                  {section.idx}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-56">
              <p className="font-medium">
                {section.idx}. {section.heading}
              </p>
              <p className="text-xs opacity-80">
                {!section.reviewed
                  ? "Not read yet"
                  : section.itemCount === 0
                    ? "Read, nothing to flag"
                    : `${section.itemCount} finding${section.itemCount === 1 ? "" : "s"}`}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/** Horizontal miniature of the same strip, for lists. */
export function MiniHeatStrip({
  strip,
}: {
  strip: { idx: number; chars: number; reviewed: boolean; risk: string | null }[];
}) {
  return (
    <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-sm" aria-hidden>
      {strip.map((section) => {
        const risk = asRisk(section.risk);
        return (
          <span
            key={section.idx}
            data-risk={risk}
            style={{ flexGrow: Math.max(section.chars, 140) }}
            className={cn(
              "basis-0",
              !section.reviewed && "bg-muted",
              section.reviewed && risk === "none" && "bg-[hsl(var(--risk)/0.45)]",
              section.reviewed && risk !== "none" && "bg-[hsl(var(--risk))]",
            )}
          />
        );
      })}
    </div>
  );
}
