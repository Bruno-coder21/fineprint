import type { ItemStatus } from "@shared/domain";
import { TERM_DEFS, type TermKey } from "@shared/simulate";
import { IconCheck, IconCopy, IconSparkles } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { asRisk, type ContractItem, type ContractTerm } from "./types";

interface NegotiatePanelProps {
  items: ContractItem[];
  terms: ContractTerm[];
  draft: string | null;
  drafting: boolean;
  onSetStatus: (item: ContractItem, status: ItemStatus) => void;
  onOpenItem: (item: ContractItem) => void;
  onChangeNumbers: () => void;
  onAskDraft: () => void;
  onSaveDraft: (body: string) => void;
}

const RISK_ORDER: Record<string, number> = { red: 0, yellow: 1 };

/**
 * One place to negotiate: tick what you want changed, see the numbers you
 * proposed, and get the message that asks for it.
 */
export function NegotiatePanel({
  items,
  terms,
  draft,
  drafting,
  onSetStatus,
  onOpenItem,
  onChangeNumbers,
  onAskDraft,
  onSaveDraft,
}: NegotiatePanelProps) {
  const candidates = items
    .filter((item) => item.risk === "red" || item.risk === "yellow")
    .sort(
      (a, b) =>
        (RISK_ORDER[a.risk] ?? 2) - (RISK_ORDER[b.risk] ?? 2) ||
        a.sectionIdx - b.sectionIdx,
    );
  const flagged = items.filter((item) => item.status === "negotiate");
  const proposals = terms.filter((term) => term.proposedValue != null);
  const [text, setText] = useState(draft ?? "");
  const focused = useRef(false);

  // The agent can rewrite the draft while the page is open; follow it unless
  // the user is typing.
  useEffect(() => {
    if (!focused.current) setText(draft ?? "");
  }, [draft]);

  const nothingChosen = flagged.length === 0 && proposals.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <StepHeading
          step="1"
          title="What you want changed"
          hint={`${flagged.length} chosen`}
        />
        {flagged.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Nothing chosen yet. In step 1, answer{" "}
            <span className="font-medium text-foreground">
              I want this changed
            </span>{" "}
            on the points you do not accept, or tick them below.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {flagged.map((item) => (
              <li
                key={item.id}
                data-risk={asRisk(item.risk)}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="size-2 shrink-0 rounded-full bg-[hsl(var(--risk))]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.plain}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="shrink-0 rounded border border-border px-1.5 py-px text-xs font-medium tabular-nums hover:bg-muted"
                  aria-label={`Read section ${item.sectionIdx}`}
                >
                  {`\u00a7${item.sectionIdx}`}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onSetStatus(item, "open")}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Add or remove clauses from the full list
          </summary>
          <ul className="mt-2 flex max-h-[19.5rem] flex-col divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card">
            {candidates.map((item) => {
              const chosen = item.status === "negotiate";
              return (
                <li
                  key={item.id}
                  data-risk={asRisk(item.risk)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors",
                    chosen && "bg-muted/60",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={chosen}
                    aria-label={`Negotiate ${item.title}`}
                    onClick={() =>
                      onSetStatus(item, chosen ? "open" : "negotiate")
                    }
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      chosen
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground/50 hover:border-foreground",
                    )}
                  >
                    {chosen ? <IconCheck className="size-3.5" strokeWidth={3} /> : null}
                  </button>
                  <span className="size-2 shrink-0 rounded-full bg-[hsl(var(--risk))]" />
                  <button
                    type="button"
                    onClick={() => onSetStatus(item, chosen ? "open" : "negotiate")}
                    className="min-w-0 flex-1 text-start"
                  >
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.plain}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item)}
                    className="shrink-0 rounded border border-border px-1.5 py-px text-xs font-medium tabular-nums hover:bg-muted"
                    aria-label={`Read section ${item.sectionIdx}`}
                  >
                    {`§${item.sectionIdx}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      <section className="flex flex-col gap-2.5">
        <StepHeading
          step="2"
          title="Numbers you would rather have"
          hint={
            proposals.length === 0 ? "none yet" : `${proposals.length} changed`
          }
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {proposals.map((term) => (
            <span
              key={term.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/50 bg-emerald-500/5 px-2.5 py-1 text-xs"
            >
              {TERM_DEFS[term.key as TermKey]?.label ?? term.key}
              <span className="tabular-nums text-muted-foreground line-through">
                {term.value}
              </span>
              <span className="font-semibold tabular-nums">
                {term.proposedValue}
              </span>
            </span>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={onChangeNumbers}
          >
            {proposals.length === 0 ? "Try different numbers" : "Change them"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <StepHeading step="3" title="The message that asks for it" />
        {text || draft ? (
          <Textarea
            value={text}
            rows={11}
            onFocus={() => {
              focused.current = true;
            }}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              focused.current = false;
              if (text !== (draft ?? "")) onSaveDraft(text);
            }}
            className="resize-y text-sm leading-relaxed"
            aria-label="Negotiation message"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="gap-1.5"
            disabled={drafting || nothingChosen}
            onClick={onAskDraft}
          >
            <IconSparkles className="size-4" />
            {drafting
              ? "Writing..."
              : draft
                ? "Rewrite the message"
                : "Write the message"}
          </Button>
          {text ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("Message copied");
                } catch {
                  toast.error("Could not copy. Select the text and copy it.");
                }
              }}
            >
              <IconCopy className="size-4" />
              Copy
            </Button>
          ) : null}
          {nothingChosen ? (
            <span className="text-xs text-muted-foreground">
              Tick at least one clause or change a number first.
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StepHeading({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint?: string | undefined;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
        {step}
      </span>
      {title}
      {hint ? (
        <span className="font-normal text-muted-foreground">{hint}</span>
      ) : null}
    </h3>
  );
}
