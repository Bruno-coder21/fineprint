import { RISK_LABEL, type ItemStatus } from "@shared/domain";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconHandStop,
  IconMessageQuestion,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  asRisk,
  asStatus,
  type ContractItem,
  type ContractSection,
} from "./types";

const KIND_PRIORITY: Record<string, number> = {
  renewal: 0,
  termination: 1,
  penalty: 2,
  payment: 3,
  liability: 4,
};

/** The points worth a decision: red first, then yellow, in reading order. */
export function reviewQueue(
  items: ContractItem[],
  includeMinor = false,
): ContractItem[] {
  const hasRed = items.some((item) => item.risk === "red");
  return items
    .filter(
      (item) =>
        item.risk === "red" ||
        (item.risk === "yellow" && (includeMinor || !hasRed)),
    )
    .sort(
      (a, b) =>
        (a.risk === "red" ? 0 : 1) - (b.risk === "red" ? 0 : 1) ||
        (a.risk === "red"
          ? (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9)
          : 0) ||
        a.sectionIdx - b.sectionIdx,
    );
}

interface ReviewDeckProps {
  items: ContractItem[];
  sections: ContractSection[];
  writing: boolean;
  onDecide: (item: ContractItem, status: ItemStatus) => void;
  onFocusSection: (sectionIdx: number | null) => void;
  onReadClause: (item: ContractItem) => void;
  onAsk: (item: ContractItem) => void;
  onWriteMessage: () => void;
  onSeeCosts: () => void;
}

/**
 * One point at a time, one decision at a time: is this fine, or do you want
 * it changed? The answers become the negotiation message.
 */
export function ReviewDeck({
  items,
  sections,
  writing,
  onDecide,
  onFocusSection,
  onReadClause,
  onAsk,
  onWriteMessage,
  onSeeCosts,
}: ReviewDeckProps) {
  const [includeMinor, setIncludeMinor] = useState(false);
  const queue = useMemo(
    () => reviewQueue(items, includeMinor),
    [items, includeMinor],
  );
  const minorCount = useMemo(
    () =>
      items.some((item) => item.risk === "red")
        ? items.filter((item) => item.risk === "yellow").length
        : 0,
    [items],
  );
  const firstOpen = queue.findIndex((item) => item.status === "open");
  const [index, setIndex] = useState(firstOpen === -1 ? queue.length : firstOpen);
  const [queueSize, setQueueSize] = useState(queue.length);
  if (queueSize !== queue.length) {
    // The agent is still adding points: stay on the first undecided one.
    setQueueSize(queue.length);
    setIndex(firstOpen === -1 ? queue.length : firstOpen);
  }

  const current = index < queue.length ? queue[index] : undefined;
  const currentSection = current?.sectionIdx ?? null;
  useEffect(() => {
    onFocusSection(currentSection);
    return () => onFocusSection(null);
  }, [currentSection, onFocusSection]);

  const wanted = queue.filter((item) => item.status === "negotiate");
  const fine = queue.filter((item) => item.status === "ok");
  const decided = wanted.length + fine.length;

  if (queue.length === 0) return null;

  const progress = (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-[3px]" aria-hidden>
        {queue.map((item, position) => (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            data-risk={asRisk(item.risk)}
            onClick={() => setIndex(position)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              item.status === "open"
                ? "bg-[hsl(var(--risk)/0.3)]"
                : "bg-[hsl(var(--risk))]",
              position === index && "h-2.5 ring-1 ring-foreground",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {decided} of {queue.length} decided
      </span>
    </div>
  );

  if (!current) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
        {progress}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xl font-semibold tracking-tight">
            {wanted.length > 0
              ? `You want ${wanted.length} thing${wanted.length === 1 ? "" : "s"} changed.`
              : "You are fine with everything."}
          </h3>
          <p className="text-sm text-muted-foreground">
            {wanted.length > 0
              ? `You are fine with the other ${fine.length}. The agent can now write the message that asks for your changes.`
              : "Nothing to negotiate. You can still look at what the contract costs over time."}
          </p>
        </div>
        {wanted.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {wanted.map((item) => (
              <li
                key={item.id}
                data-risk={asRisk(item.risk)}
                className="flex items-center gap-2.5 text-sm"
              >
                <span className="size-2 shrink-0 rounded-full bg-[hsl(var(--risk))]" />
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground">{`§${item.sectionIdx}`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {wanted.length > 0 ? (
            <Button
              type="button"
              size="lg"
              className="gap-2"
              disabled={writing}
              onClick={onWriteMessage}
            >
              <IconSparkles className="size-5" />
              {writing ? "Writing your message..." : "Write my message"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={onSeeCosts}
          >
            See what it costs over time
            <IconArrowRight className="size-4" />
          </Button>
          {!includeMinor && minorCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setIncludeMinor(true)}
            >
              Review {minorCount} smaller points too
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setIndex(Math.max(0, queue.length - 1))}
          >
            <IconArrowLeft className="size-4" />
            Review again
          </Button>
        </div>
      </div>
    );
  }

  const status = asStatus(current.status);
  const heading =
    sections.find((section) => section.idx === current.sectionIdx)?.heading ?? "";
  const decide = (next: ItemStatus) => {
    onDecide(current, next);
    setIndex((value) => Math.min(queue.length, value + 1));
  };

  return (
    <div
      data-risk={asRisk(current.risk)}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:px-7 sm:py-6"
    >
      {progress}

      <div key={current.id} className="fineprint-point flex flex-col gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--risk))]">
          <span className="size-2.5 rounded-full bg-[hsl(var(--risk))]" />
          {RISK_LABEL[current.risk === "red" ? "red" : "yellow"]}
          <span className="font-normal normal-case tracking-normal text-muted-foreground">
            Point {index + 1} of {queue.length}
          </span>
        </p>
        <h3 className="text-2xl font-semibold leading-tight tracking-tight">
          {current.title}
        </h3>
        <p className="max-w-2xl text-base leading-relaxed">{current.plain}</p>
        <figure className="max-w-2xl border-s-2 border-[hsl(var(--risk))] ps-4">
          <figcaption className="text-xs text-muted-foreground">
            The contract says, in {`§${current.sectionIdx}`}
            {heading ? ` ${heading}` : ""}:
          </figcaption>
          <blockquote className="fineprint-contract-text mt-1 line-clamp-3 text-[15px] text-muted-foreground">
            {`“${current.quote}”`}
          </blockquote>
        </figure>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Are you fine with this?</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            variant={status === "ok" ? "secondary" : "outline"}
            className="min-w-44 gap-2"
            onClick={() => decide("ok")}
          >
            <IconCheck className="size-5" />
            Fine by me
          </Button>
          <Button
            type="button"
            size="lg"
            variant={status === "negotiate" ? "default" : "outline"}
            className={cn(
              "min-w-44 gap-2",
              status !== "negotiate" &&
                "border-foreground/40 hover:bg-foreground hover:text-background",
            )}
            onClick={() => decide("negotiate")}
          >
            <IconHandStop className="size-5" />
            I want this changed
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border pt-3 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          <IconArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setIndex((value) => Math.min(queue.length, value + 1))}
        >
          Skip
          <IconArrowRight className="size-4" />
        </Button>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onReadClause(current)}
        >
          Read the whole clause
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onAsk(current)}
        >
          <IconMessageQuestion className="size-4" />
          Ask the agent about this
        </Button>
      </div>
    </div>
  );
}
