import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  useSetHeaderActions,
  useSetPageTitle,
} from "@agent-native/toolkit/app-shell";
import type { ItemStatus } from "@shared/domain";
import {
  formatDate,
  formatMoney,
  modelFromTerms,
  simulate,
  snapshotAt,
  dateAtMonth,
  isModelReady,
  type TermKey,
} from "@shared/simulate";
import {
  IconArrowLeft,
  IconArrowRight,
  IconEraser,
  IconFileText,
  IconSparkles,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { AtAGlance } from "@/components/contract/AtAGlance";
import { Balance } from "@/components/contract/Balance";
import { Findings } from "@/components/contract/Findings";
import { HeatStrip } from "@/components/contract/HeatStrip";
import { Levers } from "@/components/contract/Levers";
import { formatMonth, MoneyMap } from "@/components/contract/MoneyMap";
import { NegotiatePanel } from "@/components/contract/NegotiatePanel";
import { ReviewDeck, reviewQueue } from "@/components/contract/ReviewDeck";
import { SourceSheet } from "@/components/contract/SourceSheet";
import { TimeRuler } from "@/components/contract/TimeRuler";
import {
  shortParty,
  type ContractData,
  type ContractItem,
} from "@/components/contract/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: `Contract - ${APP_TITLE}` }];
}

function parseMonth(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function ContractRoute() {
  const { contractId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const params = useMemo(
    () => ({ contractId, view: "full" as const }),
    [contractId],
  );
  const queryKey = useMemo(() => ["action", "get-contract", params], [params]);
  const query = useActionQuery("get-contract", params);
  const data = query.data as ContractData | undefined;

  useSetPageTitle(data?.contract.title ?? "Contract");

  // --- shared URL state: month on the ruler, open clause, open finding ---
  const urlMonth = parseMonth(searchParams.get("m"));
  const [month, setMonth] = useState(urlMonth);
  const committedMonth = useRef(urlMonth);
  /** Until this time, ruler moves made by the agent are ignored. */
  const mapQuietUntil = useRef(0);
  const commitTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    // The agent moves the ruler by editing the URL; follow it. Skip the echo
    // of this tab's own drag so the ruler never jumps backwards.
    if (urlMonth !== committedMonth.current) {
      if (Date.now() < mapQuietUntil.current) {
        // While the agent is still mapping it checks numbers for its summary.
        // That must not drag the person off the step they are on.
        committedMonth.current = 0;
        setSearchParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            next.delete("m");
            next.delete("tab");
            return next;
          },
          { replace: true, preventScrollReset: true },
        );
        return;
      }
      committedMonth.current = urlMonth;
      setMonth(urlMonth);
      // Say so: a ruler that moves by itself is confusing otherwise.
      toast(`The agent moved the ruler to month ${urlMonth}`, {
        description: "The numbers under the ruler now show that month.",
      });
    }
  }, [urlMonth, setSearchParams]);
  useEffect(() => () => window.clearTimeout(commitTimer.current), []);

  const patchSearch = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const changeMonth = useCallback(
    (next: number) => {
      setMonth(next);
      window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(() => {
        committedMonth.current = next;
        patchSearch({ m: next === 0 ? null : String(next) });
      }, 220);
    },
    [patchSearch],
  );

  const tabParam = searchParams.get("tab");
  const tab: "says" | "costs" | "ask" =
    tabParam === "costs" || tabParam === "ask" ? tabParam : "says";
  const setTab = useCallback(
    (next: "says" | "costs" | "ask") => {
      patchSearch({ tab: next === "says" ? null : next });
      document
        .querySelector(".agent-native-app-main")
        ?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [patchSearch],
  );

  const secParam = searchParams.get("sec");
  const selectedIdx =
    secParam != null && secParam !== "" && Number.isFinite(Number(secParam))
      ? Number(secParam)
      : null;
  const selectedItemId = searchParams.get("item");
  const openSection = useCallback(
    (idx: number) => patchSearch({ sec: String(idx), item: null }),
    [patchSearch],
  );
  const openItem = useCallback(
    (item: ContractItem) =>
      patchSearch({ sec: String(item.sectionIdx), item: item.id }),
    [patchSearch],
  );

  // --- writes: the same actions the agent calls ---
  const patchCache = useCallback(
    (update: (old: ContractData) => ContractData) => {
      const previous = queryClient.getQueryData<ContractData>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, update(previous));
      return previous;
    },
    [queryClient, queryKey],
  );
  const rollback = (context: unknown, error: unknown, fallback: string) => {
    const previous = (context as { previous?: ContractData } | undefined)
      ?.previous;
    if (previous) queryClient.setQueryData(queryKey, previous);
    toast.error(actionErrorMessage(error) ?? fallback);
  };

  const updateItem = useActionMutation("update-item", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      return {
        previous: patchCache((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === input.id
              ? { ...item, ...(input.status ? { status: input.status } : {}) }
              : item,
          ),
        })),
      };
    },
    onError: (error, _input, context) =>
      rollback(context, error, "Could not update the finding."),
  });
  const deleteItem = useActionMutation("delete-item", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      return {
        previous: patchCache((old) => ({
          ...old,
          items: old.items.filter((item) => item.id !== input.id),
        })),
      };
    },
    onError: (error, _input, context) =>
      rollback(context, error, "Could not remove the finding."),
  });
  const updateTerm = useActionMutation("update-term", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      return {
        previous: patchCache((old) => ({
          ...old,
          terms: old.terms.map((term) =>
            term.key === input.key && input.proposedValue !== undefined
              ? { ...term, proposedValue: input.proposedValue }
              : term,
          ),
        })),
      };
    },
    onError: (error, _input, context) =>
      rollback(context, error, "Could not change the term."),
  });
  const addItems = useActionMutation("add-items", {
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not pin that passage."),
    onSuccess: () => toast.success("Pinned to the map"),
  });
  const saveDraft = useActionMutation("save-draft", {
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not save the message."),
  });
  const clearMap = useActionMutation("clear-map", {
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not erase the map."),
  });
  const [confirmErase, setConfirmErase] = useState(false);
  /** Clause the review deck is on, ringed in the strip. */
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  // --- hand-offs to the agent ---
  // The page hands work to the agent and then watches the data, not the
  // chat: a run counts as live while the agent keeps writing. A hand-off the
  // chat never picked up is retried once and then reported, so a button can
  // never sit disabled on work that is not happening.
  const [pending, setPending] = useState<"map" | "draft" | null>(null);
  const [lastActivity, setLastActivity] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 4000);
    return () => window.clearInterval(timer);
  }, [pending]);
  const lastAsk = useRef<{
    message: string;
    context: string;
    kind: "map" | "draft";
  } | null>(null);
  const retried = useRef(false);
  const live = now - lastActivity < 75_000;
  const mapping = pending === "map" && live;
  const drafting = pending === "draft" && live;
  const markActivity = useCallback(() => {
    const stamp = Date.now();
    setLastActivity(stamp);
    setNow(stamp);
  }, []);
  const askAgent = useCallback(
    async (
      message: string,
      context: string,
      options: { kind?: "map" | "draft"; newThread?: boolean } = {},
    ) => {
      markActivity();
      if (options.kind === "map") {
        mapQuietUntil.current = Date.now() + 10 * 60_000;
      }
      if (options.kind) {
        setPending(options.kind);
        lastAsk.current = { message, context, kind: options.kind };
        retried.current = false;
      }
      // A closed panel restoring an old conversation can drop the message, so
      // a hand-off made with the panel closed always starts its own thread.
      const panelOpen = Boolean(
        document.querySelector(".agent-composer-prosemirror"),
      );
      const newThread = options.newThread || !panelOpen;
      const send = (timeoutMs: number) =>
        sendToAgentChatAndConfirm(
          {
            message,
            context,
            submit: true,
            openSidebar: true,
            chatTarget: "local",
            ...(newThread ? { newTab: true } : {}),
          },
          { timeoutMs },
        ).catch((error: unknown) => {
          console.warn("[fineprint] agent hand-off failed", error);
          return { delivered: false, reason: String(error) };
        });
      let result = await send(7000);
      if (!result.delivered) {
        // The panel may still have been opening; give it one more try.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        result = await send(9000);
      }
      if (!result.delivered) {
        if (options.kind) setPending(null);
        toast.error(
          "The agent did not pick that up. Open the agent panel (top right) and try again.",
        );
      } else {
        markActivity();
      }
    },
    [markActivity],
  );
  useEffect(() => {
    // Watchdog: the agent took the message but nothing changed in 25 seconds.
    // Ask once more in a fresh thread before giving the button back.
    if (!pending || retried.current || !lastAsk.current) return;
    if (now - lastActivity < 25_000) return;
    retried.current = true;
    const { message, context, kind } = lastAsk.current;
    markActivity();
    void sendToAgentChatAndConfirm(
      {
        message,
        context,
        submit: true,
        openSidebar: true,
        chatTarget: "local",
        newTab: true,
      },
      { timeoutMs: 9000 },
    )
      .then((result) => {
        if (!result.delivered) {
          setPending((current) => (current === kind ? null : current));
          toast.error(
            "The agent did not start. Open the agent panel (top right) and try again.",
          );
        }
      })
      .catch(() => undefined);
  }, [pending, now, lastActivity, markActivity]);
  const agentContext = JSON.stringify({
    contractId,
    title: data?.contract.title,
    sections: data?.coverage.total,
  });

  // Every decision says what it did, so a click is never silent.
  const setStatus = useCallback(
    (item: ContractItem, status: ItemStatus) => {
      updateItem.mutate({ id: item.id, status });
      const chosen =
        (data?.items ?? []).filter(
          (other) => other.id !== item.id && other.status === "negotiate",
        ).length + (status === "negotiate" ? 1 : 0);
      if (status === "negotiate") {
        toast(`Added to your changes: ${item.title}`, {
          description: `${chosen} thing${chosen === 1 ? "" : "s"} to ask for. See them in step 3.`,
        });
      } else if (item.status === "negotiate") {
        toast(`Removed from your changes: ${item.title}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.items],
  );
  const askAboutItem = useCallback(
    (item: ContractItem) =>
      void askAgent(
        `Explain "${item.title}" (section ${item.sectionIdx}) and what I could reasonably ask for instead.`,
        JSON.stringify({ contractId, itemId: item.id }),
      ),
    [askAgent, contractId],
  );
  const writeMessage = () => {
    setTab("ask");
    void askAgent(
      "Write the negotiation message for the clauses I flagged and the terms I proposed, and save it to the Negotiate panel.",
      agentContext,
      { kind: "draft" },
    );
  };

  const total = data?.coverage.total ?? 0;
  const reviewed = data?.coverage.reviewed ?? 0;
  const items = data?.items ?? [];
  const terms = data?.terms ?? [];
  const mapped = items.length > 0 || reviewed > 0;
  const toDecide = reviewQueue(items);
  const toDecideCount = toDecide.length;
  const decidedCount = toDecide.filter((item) => item.status !== "open").length;
  const negotiateCount =
    items.filter((item) => item.status === "negotiate").length +
    terms.filter((term) => term.proposedValue != null).length;
  const draftLength = data?.contract.negotiationDraft?.length ?? 0;
  useEffect(() => {
    // Every write by the agent shows up here and keeps the run "live".
    markActivity();
  }, [reviewed, items.length, terms.length, draftLength, markActivity]);
  useEffect(() => {
    if (pending === "map" && total > 0 && reviewed >= total && terms.length > 0) {
      setPending(null);
      mapQuietUntil.current = Date.now() + 40_000;
      toast.success("The map is ready", {
        description: `${toDecideCount} points need your decision. Start with step 1.`,
      });
    }
  }, [pending, reviewed, total, terms.length]);
  useEffect(() => {
    if (pending === "draft" && draftLength > 0) {
      setPending(null);
      toast.success("Your message is ready", {
        description: "Read it in step 3, edit anything, then copy it.",
      });
    }
    // Only a change in the saved draft ends a drafting run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.contract.negotiationDraft]);

  const { model, simulation, proposedSimulation, snapshot, proposedSnapshot } =
    useMemo(() => {
      const written = Object.fromEntries(
        terms.map((term) => [term.key, term.value]),
      );
      const proposed = Object.fromEntries(
        terms.map((term) => [term.key, term.proposedValue ?? term.value]),
      );
      const writtenModel = modelFromTerms(written);
      const writtenSim = simulate(writtenModel);
      const hasProposal = terms.some((term) => term.proposedValue != null);
      const proposedModel = hasProposal ? modelFromTerms(proposed) : null;
      const clamped = Math.min(month, writtenSim.horizon);
      return {
        model: writtenModel,
        simulation: writtenSim,
        proposedSimulation:
          proposedModel && isModelReady(proposedModel)
            ? simulate(proposedModel)
            : null,
        snapshot: snapshotAt(writtenModel, clamped),
        proposedSnapshot:
          proposedModel && isModelReady(proposedModel)
            ? snapshotAt(proposedModel, clamped)
            : null,
      };
    }, [terms, month]);

  const currency = data?.contract.currency ?? "USD";
  const money = (value: number) => formatMoney(value, currency);

  const headerActions = useMemo(
    () =>
      data ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => openSection(data.sections[0]?.idx ?? 0)}
          >
            <IconFileText className="size-4" />
            <span className="hidden sm:inline">Original text</span>
          </Button>
          {mapped ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setConfirmErase(true)}
            >
              <IconEraser className="size-4" />
              <span className="hidden sm:inline">Erase map</span>
            </Button>
          ) : null}
        </>
      ) : null,
    [data, mapped, openSection],
  );
  useSetHeaderActions(headerActions);

  if (query.isPending) {
    return (
      <div className="flex gap-5 p-5">
        <Skeleton className="h-[70vh] w-12 rounded-lg" />
        <div className="flex flex-1 flex-col gap-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          {actionErrorMessage(query.error) ?? "Contract not found."}
        </p>
        <Link className="mt-3 inline-flex items-center gap-1.5 text-sm underline" to="/contracts">
          <IconArrowLeft className="size-4" />
          All contracts
        </Link>
      </div>
    );
  }

  const ready = simulation.ready;
  const nextEvent = simulation.events.find(
    (event) => event.month > month + 1e-6,
  );
  const startMapping = () =>
    void askAgent(
      mapped
        ? "Finish mapping this contract: read the sections that are still unread and pin what matters."
        : "Map this contract.",
      agentContext,
      { kind: "map", newThread: !mapped },
    );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-[calc(100dvh-4rem)] w-14 shrink-0 self-start border-e border-border px-2 py-3 sm:block">
        <HeatStrip
          sections={data.sections}
          selectedIdx={selectedIdx ?? (tab === "says" ? focusIdx : null)}
          onSelect={openSection}
        />
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-[66rem] flex-col gap-7 px-4 py-5 sm:px-7">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-[15rem] flex-1">
            <p className="text-sm text-muted-foreground">
              {data.contract.myParty === "You" &&
              data.contract.counterparty === "The other party" ? (
                "The parties appear here once the contract is mapped"
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {shortParty(data.contract.myParty)}
                  </span>
                  {" and "}
                  <span className="font-medium text-foreground">
                    {shortParty(data.contract.counterparty)}
                  </span>
                </>
              )}
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <div
                className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={reviewed}
                aria-label="Clauses read"
              >
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out"
                  style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {mapping && reviewed < total
                  ? `Reading... ${reviewed} of ${total} clauses`
                  : `${reviewed} of ${total} clauses read`}
              </span>
            </div>
          </div>
          <Balance items={items} counterparty={data.contract.counterparty} />
          {mapped && reviewed < total ? (
            <Button
              type="button"
              className="gap-1.5"
              disabled={mapping}
              onClick={startMapping}
            >
              <IconSparkles className="size-4" />
              {mapping
                ? "Mapping..."
                : mapped
                  ? "Finish the map"
                  : "Map this contract"}
            </Button>
          ) : null}
        </header>

        {mapped ? (
          <p className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              The strip on the left is the whole contract, one block per clause.
              Click a block to read it.
            </span>
            {(
              [
                ["red", "watch out"],
                ["yellow", "worth a look"],
                ["green", "fine"],
                ["none", "nothing to flag"],
              ] as const
            ).map(([risk, label]) => (
              <span
                key={risk}
                data-risk={risk}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  className={cn(
                    "size-2.5 rounded-[3px]",
                    risk === "none"
                      ? "bg-[hsl(var(--risk)/0.45)]"
                      : "bg-[hsl(var(--risk))]",
                  )}
                />
                {label}
              </span>
            ))}
          </p>
        ) : null}

        {!mapped ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border px-6 py-10">
            <p className="max-w-xl text-lg font-medium leading-snug">
              {total} clauses, none read yet. The strip on the left is the whole
              contract. It fills with color as the agent reads.
            </p>
            <p className="max-w-xl text-sm text-muted-foreground">
              Every finding is pinned to the exact words that say it. A claim the
              contract does not support is refused.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-2 gap-2"
              disabled={mapping}
              onClick={startMapping}
            >
              <IconSparkles className="size-5" />
              {mapping ? "The agent is reading..." : "Map this contract"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes about a minute. You can watch it happen.
            </p>
          </div>
        ) : null}

        {mapped ? (
          <nav
            aria-label="Steps"
            className="sticky top-0 z-10 -mx-1 flex gap-1 rounded-xl border border-border bg-background/95 p-1 backdrop-blur"
          >
            {(
              [
                {
                  id: "says",
                  step: "1",
                  label: "Review the points",
                  badge: `${decidedCount} of ${toDecideCount} decided`,
                },
                {
                  id: "costs",
                  step: "2",
                  label: "See what it costs",
                  badge: ready ? `${money(snapshot.walkAway)} to leave` : "",
                },
                {
                  id: "ask",
                  step: "3",
                  label: "Get your message",
                  badge: `${negotiateCount} change${negotiateCount === 1 ? "" : "s"} to ask for`,
                },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={tab === entry.id ? "step" : undefined}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === entry.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    tab === entry.id
                      ? "bg-background text-foreground"
                      : "border border-current",
                  )}
                >
                  {entry.step}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {entry.label}
                  </span>
                  <span className="block truncate text-xs opacity-75">
                    {entry.badge}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        ) : null}

        {mapped && tab === "says" ? (
          <section className="flex flex-col gap-6" aria-label="Review the points">
            <div className="flex flex-col gap-2.5">
              <SectionTitle>
                Go through the points that matter, one at a time
              </SectionTitle>
              <ReviewDeck
                items={items}
                sections={data.sections}
                writing={drafting}
                onDecide={setStatus}
                onFocusSection={setFocusIdx}
                onReadClause={openItem}
                onAsk={askAboutItem}
                onWriteMessage={writeMessage}
                onSeeCosts={() => setTab("costs")}
              />
            </div>
            {ready ? (
              <div className="flex flex-col gap-2.5">
                <SectionTitle>The contract at a glance</SectionTitle>
                <AtAGlance
                  model={model}
                  simulation={simulation}
                  start={snapshotAt(model, 0)}
                  terms={terms}
                  currency={currency}
                  onOpenSection={openSection}
                  onSeeCosts={() => setTab("costs")}
                />
              </div>
            ) : null}
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                See all {items.length} findings as a list
              </summary>
              <div className="mt-3">
                <Findings
                  items={items}
                  sections={data.sections}
                  selectedItemId={selectedItemId}
                  onOpenItem={openItem}
                  onSetStatus={setStatus}
                  onDelete={(item) => deleteItem.mutate({ id: item.id })}
                  onAsk={askAboutItem}
                />
              </div>
            </details>
          </section>
        ) : null}

        {mapped && tab === "costs" ? (
          ready ? (
          <section className="flex flex-col gap-4" aria-label="What it costs">
            <TabIntro>
              Follow the money, then drag the ruler through time to see what
              leaving costs in any month. Change a number to test a better deal.
            </TabIntro>
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <TimeRuler
                simulation={simulation}
                proposed={proposedSimulation}
                startDate={model.startDate}
                month={Math.min(month, simulation.horizon)}
                currency={currency}
                onMonthChange={changeMonth}
              />

              <dl className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr))]">
                <Readout
                  label={
                    snapshot.date
                      ? `Paid by ${formatDate(snapshot.date)}`
                      : `Paid by month ${formatMonth(snapshot.month)}`
                  }
                  value={money(snapshot.paid)}
                  detail={
                    model.deposit > 0
                      ? `includes ${money(model.deposit)} deposit`
                      : undefined
                  }
                />
                <Readout
                  label="Walk away now"
                  value={money(snapshot.walkAway)}
                  tone="red"
                  detail={
                    snapshot.walkAway <= 0.5
                      ? "nothing more owed"
                      : `${money(snapshot.penalty)} penalty + ${money(Math.max(0, snapshot.walkAway - snapshot.penalty))} notice period`
                  }
                  proposed={
                    proposedSnapshot &&
                    Math.abs(proposedSnapshot.walkAway - snapshot.walkAway) > 0.5
                      ? `${money(proposedSnapshot.walkAway)} as proposed, ${money(Math.abs(snapshot.walkAway - proposedSnapshot.walkAway))} ${proposedSnapshot.walkAway < snapshot.walkAway ? "less" : "more"}`
                      : undefined
                  }
                />
                <Readout
                  label="Still locked in"
                  value={money(snapshot.committed)}
                  detail={
                    snapshot.renewalLocked
                      ? "renewal can no longer be stopped"
                      : model.startDate
                        ? `until ${formatDate(dateAtMonth(model.startDate, snapshot.lockedUntil))}`
                        : `until month ${formatMonth(snapshot.lockedUntil)}`
                  }
                  tone={snapshot.renewalLocked ? "red" : undefined}
                  proposed={
                    proposedSnapshot &&
                    Math.abs(proposedSnapshot.committed - snapshot.committed) > 0.5
                      ? `${money(proposedSnapshot.committed)} as proposed`
                      : undefined
                  }
                />
                <Readout
                  label="Next deadline"
                  value={
                    nextEvent
                      ? nextEvent.date
                        ? formatDate(nextEvent.date)
                        : `Month ${formatMonth(nextEvent.month)}`
                      : "None left"
                  }
                  detail={
                    nextEvent
                      ? `${nextEvent.label}, in ${formatMonth(Number((nextEvent.month - month).toFixed(1)))} months`
                      : undefined
                  }
                />
              </dl>

              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
                {simulation.cheapestExit ? (
                  <Insight
                    tone="green"
                    onJump={() => changeMonth(simulation.cheapestExit!.month)}
                  >
                    Cheapest moment to leave early:{" "}
                    <strong>
                      {simulation.cheapestExit.date
                        ? formatDate(simulation.cheapestExit.date)
                        : `month ${simulation.cheapestExit.month}`}
                    </strong>
                    , {money(simulation.cheapestExit.cost)}.
                  </Insight>
                ) : null}
                {simulation.trap ? (
                  <Insight
                    tone="red"
                    onJump={() =>
                      changeMonth(
                        Math.min(
                          simulation.horizon,
                          Math.ceil(simulation.trap!.month * 2) / 2 + 0.5,
                        ),
                      )
                    }
                  >
                    Say nothing by{" "}
                    <strong>
                      {simulation.trap.date
                        ? formatDate(simulation.trap.date)
                        : `month ${formatMonth(simulation.trap.month)}`}
                    </strong>{" "}
                    and you are locked in for {simulation.trap.renewalMonths} more
                    months: {money(simulation.trap.lockedAmount)}.
                  </Insight>
                ) : null}
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() =>
                    void askAgent(
                      `What happens if I leave at month ${formatMonth(month)}? Walk me through it.`,
                      agentContext,
                    )
                  }
                >
                  Ask the agent to walk through leaving at month{" "}
                  {formatMonth(month)}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <MoneyMap
                model={model}
                snapshot={snapshot}
                proposedSnapshot={proposedSnapshot}
                terms={terms}
                myParty={data.contract.myParty}
                counterparty={data.contract.counterparty}
                currency={currency}
                onOpenSection={openSection}
              />
            </div>

            <Levers
              terms={terms}
              onOpenSection={openSection}
              onPropose={(key: TermKey, proposedValue) =>
                updateTerm.mutate({ contractId, key, proposedValue })
              }
            />

            <NextStep
              label="Decide what to ask for"
              onClick={() => setTab("ask")}
            />
          </section>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
              The money map and time ruler appear once the term, the recurring
              payment, and the exit rule are pinned.
            </div>
          )
        ) : null}

        {mapped && tab === "ask" ? (
          <section className="flex flex-col gap-4" aria-label="What to ask for">
            <TabIntro>
              Pick what you want changed. The agent writes the message, and you
              edit it before sending.
            </TabIntro>
            <NegotiatePanel
              items={items}
              terms={terms}
              draft={data.contract.negotiationDraft}
              drafting={drafting}
              onSetStatus={setStatus}
              onOpenItem={openItem}
              onChangeNumbers={() => setTab("costs")}
              onSaveDraft={(body) => saveDraft.mutate({ contractId, body })}
              onAskDraft={() =>
                void askAgent(
                  "Write the negotiation message for the clauses I flagged and the terms I proposed, and save it to the Negotiate panel.",
                  agentContext,
                  { kind: "draft" },
                )
              }
            />
          </section>
        ) : null}

        <p className="pb-4 text-xs text-muted-foreground">
          Fineprint helps you read a contract. It is not legal advice.
        </p>
      </div>

      <SourceSheet
        open={selectedIdx != null}
        title={data.contract.title}
        sections={data.sections}
        items={items}
        selectedIdx={selectedIdx}
        selectedItemId={selectedItemId}
        pinning={addItems.isPending}
        onOpenChange={(open) => {
          if (!open) patchSearch({ sec: null, item: null });
        }}
        onSelectItem={openItem}
        onPin={(pin) =>
          addItems.mutate({
            contractId,
            reviewedSectionIdxs: [],
            items: [
              {
                sectionIdx: pin.sectionIdx,
                kind: "other",
                title: pin.title,
                plain: pin.plain,
                quote: pin.quote,
                risk: pin.risk,
                favors: "both",
              },
            ],
          })
        }
      />

      <AlertDialog open={confirmErase} onOpenChange={setConfirmErase}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase this map?</AlertDialogTitle>
            <AlertDialogDescription>
              All findings, numbers, and the negotiation message are removed.
              The contract text stays, so it can be mapped again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearMap.mutate({ contractId });
                patchSearch({ m: null, sec: null, item: null });
              }}
            >
              Erase map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Readout({
  label,
  value,
  detail,
  proposed,
  tone,
}: {
  label: string;
  value: string;
  detail?: string | undefined;
  proposed?: string | undefined;
  tone?: "red" | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tone === "red" && "text-[hsl(4_74%_50%)]",
        )}
      >
        {value}
      </dd>
      {detail ? (
        <dd className="text-xs text-muted-foreground">{detail}</dd>
      ) : null}
      {proposed ? (
        <dd className="text-xs font-medium text-[hsl(152_52%_36%)]">
          {proposed}
        </dd>
      ) : null}
    </div>
  );
}

function Insight({
  tone,
  children,
  onJump,
}: {
  tone: "red" | "green";
  children: React.ReactNode;
  onJump: () => void;
}) {
  return (
    <p data-risk={tone} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="size-2 shrink-0 rounded-full bg-[hsl(var(--risk))]" />
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={onJump}
        className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Show on ruler
      </button>
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold">{children}</h2>;
}

function TabIntro({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function NextStep({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2 self-end"
      onClick={onClick}
    >
      Next: {label}
      <IconArrowRight className="size-4" />
    </Button>
  );
}
