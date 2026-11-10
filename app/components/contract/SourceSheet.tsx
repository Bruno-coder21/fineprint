import { RISKS, type Risk } from "@shared/domain";
import { findQuote } from "@shared/quote";
import { IconPin, IconX } from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { asRisk, type ContractItem, type ContractSection } from "./types";

interface SourceSheetProps {
  open: boolean;
  title: string;
  sections: ContractSection[];
  items: ContractItem[];
  selectedIdx: number | null;
  selectedItemId: string | null;
  pinning: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectItem: (item: ContractItem) => void;
  onPin: (pin: {
    sectionIdx: number;
    quote: string;
    title: string;
    plain: string;
    risk: Risk;
  }) => void;
}

interface Mark {
  start: number;
  end: number;
  item: ContractItem;
}

function marksFor(body: string, items: ContractItem[]): Mark[] {
  const marks: Mark[] = [];
  for (const item of items) {
    const range = findQuote(body, item.quote);
    if (range) marks.push({ ...range, item });
  }
  marks.sort((a, b) => a.start - b.start);
  const clean: Mark[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    clean.push(mark);
    cursor = mark.end;
  }
  return clean;
}

function SectionText({
  section,
  items,
  selectedItemId,
  onSelectItem,
}: {
  section: ContractSection;
  items: ContractItem[];
  selectedItemId: string | null;
  onSelectItem: (item: ContractItem) => void;
}) {
  const body = section.body ?? "";
  const marks = useMemo(() => marksFor(body, items), [body, items]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) {
      parts.push(<Fragment key={`t${cursor}`}>{body.slice(cursor, mark.start)}</Fragment>);
    }
    const selected = mark.item.id === selectedItemId;
    parts.push(
      <mark
        key={mark.item.id}
        data-risk={asRisk(mark.item.risk)}
        data-item-id={mark.item.id}
        role="button"
        tabIndex={0}
        title={mark.item.title}
        onClick={() => onSelectItem(mark.item)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelectItem(mark.item);
        }}
        className={cn(
          "cursor-pointer rounded-sm bg-[hsl(var(--risk-soft))] px-0.5 text-foreground underline decoration-[hsl(var(--risk))] decoration-2 underline-offset-[5px] transition-shadow",
          selected && "shadow-[0_0_0_2px_hsl(var(--risk))]",
        )}
      >
        {body.slice(mark.start, mark.end)}
      </mark>,
    );
    cursor = mark.end;
  }
  if (cursor < body.length) {
    parts.push(<Fragment key={`t${cursor}`}>{body.slice(cursor)}</Fragment>);
  }
  return <p className="whitespace-pre-wrap">{parts}</p>;
}

/** The original text. Every finding is underlined where it comes from. */
export function SourceSheet({
  open,
  title,
  sections,
  items,
  selectedIdx,
  selectedItemId,
  pinning,
  onOpenChange,
  onSelectItem,
  onPin,
}: SourceSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ sectionIdx: number; quote: string } | null>(
    null,
  );
  const [pinTitle, setPinTitle] = useState("");
  const [pinPlain, setPinPlain] = useState("");
  const [pinRisk, setPinRisk] = useState<Risk>("yellow");

  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const root = scrollRef.current;
      if (!root) return;
      const target =
        (selectedItemId
          ? root.querySelector(`[data-item-id="${selectedItemId}"]`)
          : null) ??
        (selectedIdx != null
          ? root.querySelector(`[data-section-idx="${selectedIdx}"]`)
          : null);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIdx, selectedItemId]);

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!selection || text.length < 12) return;
    const anchor =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
    const host = anchor?.closest("[data-section-idx]");
    if (!host) return;
    setDraft({
      sectionIdx: Number(host.getAttribute("data-section-idx")),
      quote: text.slice(0, 600),
    });
    setPinTitle("");
    setPinPlain("");
    setPinRisk("yellow");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[min(38rem,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <div className="border-b border-border px-6 py-4">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs">
            The original text. Select any passage to pin it yourself.
          </SheetDescription>
        </div>
        <div
          ref={scrollRef}
          onMouseUp={captureSelection}
          className="fineprint-contract-text min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[15px]"
        >
          {sections.map((section) => (
            <section
              key={section.idx}
              data-section-idx={section.idx}
              data-risk={asRisk(section.risk)}
              className={cn(
                "-mx-3 mb-2 rounded-lg border-s-4 px-3 py-2.5 transition-colors",
                section.idx === selectedIdx
                  ? "border-[hsl(var(--risk))] bg-muted/50"
                  : "border-transparent",
              )}
            >
              <SectionText
                section={section}
                items={items.filter((item) => item.sectionIdx === section.idx)}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
              />
            </section>
          ))}
        </div>

        {draft ? (
          <form
            className="flex flex-col gap-2.5 border-t border-border bg-card px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pinTitle.trim()) return;
              onPin({
                sectionIdx: draft.sectionIdx,
                quote: draft.quote,
                title: pinTitle.trim(),
                plain: pinPlain.trim() || pinTitle.trim(),
                risk: pinRisk,
              });
              setDraft(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <div className="flex items-start gap-2">
              <p className="fineprint-contract-text line-clamp-2 flex-1 border-s-2 border-foreground/40 ps-2.5 text-[13px] text-muted-foreground">
                {draft.quote}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label="Cancel pin"
                onClick={() => setDraft(null)}
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <Input
              autoFocus
              value={pinTitle}
              onChange={(event) => setPinTitle(event.target.value)}
              placeholder="What is this? e.g. Landlord can enter anytime"
              maxLength={80}
            />
            <Input
              value={pinPlain}
              onChange={(event) => setPinPlain(event.target.value)}
              placeholder="What it means for you (optional)"
              maxLength={320}
            />
            <div className="flex items-center gap-1.5">
              {RISKS.map((risk) => (
                <button
                  key={risk}
                  type="button"
                  data-risk={risk}
                  aria-pressed={pinRisk === risk}
                  onClick={() => setPinRisk(risk)}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-xs font-medium capitalize transition-colors",
                    pinRisk === risk
                      ? "border-[hsl(var(--risk))] bg-[hsl(var(--risk))] text-white"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {risk}
                </button>
              ))}
              <Button
                type="submit"
                size="sm"
                className="ml-auto gap-1.5"
                disabled={!pinTitle.trim() || pinning}
              >
                <IconPin className="size-4" />
                Pin this
              </Button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
