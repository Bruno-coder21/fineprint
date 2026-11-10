/**
 * The contract simulator. Pure functions only: the page uses them for the
 * time ruler, and the `simulate` action uses the same code so the agent
 * answers "what if" questions with computed numbers instead of model math.
 */

export const TERM_KEYS = [
  "start_date",
  "term_months",
  "monthly_fee",
  "deposit",
  "notice_days",
  "early_exit_type",
  "early_exit_value",
  "auto_renew",
  "renewal_term_months",
  "renewal_increase_pct",
  "late_fee",
] as const;

export type TermKey = (typeof TERM_KEYS)[number];

export const EXIT_TYPES = [
  "fixed",
  "months_of_fee",
  "percent_of_remaining",
  "all_remaining",
  "none",
] as const;

export type ExitType = (typeof EXIT_TYPES)[number];

export type TermUnit = "date" | "months" | "money" | "days" | "pct" | "enum" | "bool";

export const TERM_DEFS: Record<
  TermKey,
  { label: string; unit: TermUnit; help: string }
> = {
  start_date: {
    label: "Start date",
    unit: "date",
    help: "First day of the term, YYYY-MM-DD.",
  },
  term_months: {
    label: "Initial term",
    unit: "months",
    help: "Length of the initial commitment in months.",
  },
  monthly_fee: {
    label: "Recurring payment",
    unit: "money",
    help: "What you pay each month (rent, subscription, retainer).",
  },
  deposit: {
    label: "Deposit / upfront",
    unit: "money",
    help: "One-time amount paid at the start.",
  },
  notice_days: {
    label: "Notice period",
    unit: "days",
    help: "Days of written notice required to leave or to stop a renewal.",
  },
  early_exit_type: {
    label: "Early exit rule",
    unit: "enum",
    help: "fixed = flat fee; months_of_fee = N recurring payments; percent_of_remaining = % of what is left; all_remaining = you owe everything left; none = free to leave with notice.",
  },
  early_exit_value: {
    label: "Early exit amount",
    unit: "money",
    help: "The number that goes with the early exit rule (fee, number of months, or percent).",
  },
  auto_renew: {
    label: "Auto-renews",
    unit: "bool",
    help: "true when the contract renews by itself unless you give notice.",
  },
  renewal_term_months: {
    label: "Renewal term",
    unit: "months",
    help: "Length of each automatic renewal in months.",
  },
  renewal_increase_pct: {
    label: "Renewal increase",
    unit: "pct",
    help: "Percent the recurring payment goes up at renewal.",
  },
  late_fee: {
    label: "Late fee",
    unit: "money",
    help: "Flat fee charged for one late payment.",
  },
};

export interface Model {
  startDate: string | null;
  termMonths: number;
  monthlyFee: number;
  deposit: number;
  noticeDays: number;
  exitType: ExitType;
  exitValue: number;
  autoRenew: boolean;
  renewalTermMonths: number;
  renewalIncreasePct: number;
  lateFee: number;
}

export type TermValues = Partial<Record<string, string | null | undefined>>;

function num(value: string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: string | null | undefined): boolean {
  return /^(true|yes|1)$/i.test(String(value ?? "").trim());
}

export function modelFromTerms(terms: TermValues): Model {
  const termMonths = Math.max(0, num(terms.term_months));
  const exitRaw = String(terms.early_exit_type ?? "").trim() as ExitType;
  const exitType = (EXIT_TYPES as readonly string[]).includes(exitRaw)
    ? exitRaw
    : "all_remaining";
  const startRaw = String(terms.start_date ?? "").trim();
  return {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : null,
    termMonths,
    monthlyFee: Math.max(0, num(terms.monthly_fee)),
    deposit: Math.max(0, num(terms.deposit)),
    noticeDays: Math.max(0, num(terms.notice_days)),
    exitType,
    exitValue: Math.max(0, num(terms.early_exit_value)),
    autoRenew: bool(terms.auto_renew),
    renewalTermMonths: Math.max(0, num(terms.renewal_term_months)) || termMonths,
    renewalIncreasePct: Math.max(0, num(terms.renewal_increase_pct)),
    lateFee: Math.max(0, num(terms.late_fee)),
  };
}

export function isModelReady(model: Model): boolean {
  return model.termMonths > 0 && model.monthlyFee > 0;
}

export interface Snapshot {
  /** Months since the start date. */
  month: number;
  /** ISO date for this month when the start date is known. */
  date: string | null;
  /** Recurring payment in force at this month. */
  fee: number;
  /** Total paid so far, deposit included. */
  paid: number;
  /** Month the current lock-in ends if you do nothing more. */
  lockedUntil: number;
  /** Payments you are still locked into if you stay. */
  committed: number;
  /** Penalty alone for leaving now. */
  penalty: number;
  /** Payments still owed during the notice period. */
  noticeCost: number;
  /** Total cost to walk away now. */
  walkAway: number;
  /** True once the auto-renewal can no longer be stopped. */
  renewalLocked: boolean;
}

export interface SimEvent {
  month: number;
  date: string | null;
  label: string;
  kind: "start" | "deadline" | "end" | "renewal";
}

export interface Simulation {
  ready: boolean;
  horizon: number;
  points: Snapshot[];
  events: SimEvent[];
  cheapestExit: { month: number; date: string | null; cost: number } | null;
  trap: {
    month: number;
    date: string | null;
    lockedAmount: number;
    renewalMonths: number;
  } | null;
  totalIfYouStay: number;
}

const EPSILON = 1e-6;

export function dateAtMonth(startDate: string | null, month: number): string | null {
  if (!startDate) return null;
  const [year = 1970, monthIndex = 1, day = 1] = startDate
    .split("-")
    .map(Number);
  const whole = Math.floor(month);
  const fraction = month - whole;
  const date = new Date(Date.UTC(year, monthIndex - 1 + whole, day));
  if (fraction > EPSILON) date.setUTCDate(date.getUTCDate() + Math.round(fraction * 30));
  return date.toISOString().slice(0, 10);
}

function noticeMonths(model: Model): number {
  return model.noticeDays / 30;
}

function renewalFee(model: Model): number {
  return model.monthlyFee * (1 + model.renewalIncreasePct / 100);
}

function feeAt(model: Model, month: number): number {
  return month < model.termMonths - EPSILON ? model.monthlyFee : renewalFee(model);
}

/** Payments owed between two months, across the renewal price change. */
function feesBetween(model: Model, from: number, to: number): number {
  if (to <= from) return 0;
  const term = model.termMonths;
  const first = Math.max(0, Math.min(to, term) - Math.min(from, term));
  const second = Math.max(0, Math.max(to, term) - Math.max(from, term));
  return first * model.monthlyFee + second * renewalFee(model);
}

function lockedUntil(model: Model, month: number): number {
  const term = model.termMonths;
  if (!model.autoRenew) return Math.max(term, month);
  const notice = noticeMonths(model);
  const renewal = model.renewalTermMonths;
  let end = term;
  // Each renewal locks in once its notice deadline has passed.
  while (month > end - notice + EPSILON && renewal > 0 && end < term + renewal * 6) {
    end += renewal;
  }
  return end;
}

export function snapshotAt(model: Model, month: number): Snapshot {
  const until = lockedUntil(model, month);
  const committed = feesBetween(model, month, until);
  const fee = feeAt(model, month);
  const remaining = Math.max(0, until - month);
  let penalty = 0;
  if (remaining > EPSILON) {
    if (model.exitType === "fixed") penalty = model.exitValue;
    else if (model.exitType === "months_of_fee") penalty = model.exitValue * fee;
    else if (model.exitType === "percent_of_remaining")
      penalty = (model.exitValue / 100) * committed;
    else if (model.exitType === "all_remaining") penalty = committed;
  }
  const noticeCost =
    model.exitType === "all_remaining"
      ? 0
      : feesBetween(model, month, Math.min(until, month + noticeMonths(model)));
  const walkAway = Math.min(committed, penalty + noticeCost);
  return {
    month,
    date: dateAtMonth(model.startDate, month),
    fee,
    paid: model.deposit + feesBetween(model, 0, month),
    lockedUntil: until,
    committed,
    penalty: Math.min(penalty, committed),
    noticeCost: Math.min(noticeCost, committed),
    walkAway,
    renewalLocked: model.autoRenew && until > model.termMonths + EPSILON,
  };
}

export function simulate(model: Model, step = 0.25): Simulation {
  const ready = isModelReady(model);
  const term = model.termMonths;
  const horizon = ready
    ? term + (model.autoRenew ? model.renewalTermMonths : 0)
    : 12;
  if (!ready) {
    return {
      ready,
      horizon,
      points: [],
      events: [],
      cheapestExit: null,
      trap: null,
      totalIfYouStay: 0,
    };
  }

  const points: Snapshot[] = [];
  for (let month = 0; month <= horizon + EPSILON; month += step) {
    points.push(snapshotAt(model, Math.min(horizon, Number(month.toFixed(4)))));
  }

  const notice = noticeMonths(model);
  const events: SimEvent[] = [
    { month: 0, date: dateAtMonth(model.startDate, 0), label: "Starts", kind: "start" },
  ];
  if (notice > 0 && term - notice > 0) {
    events.push({
      month: term - notice,
      date: dateAtMonth(model.startDate, term - notice),
      label: model.autoRenew
        ? "Last day to stop auto-renewal"
        : "Give notice by",
      kind: "deadline",
    });
  }
  events.push({
    month: term,
    date: dateAtMonth(model.startDate, term),
    label: model.autoRenew
      ? `Auto-renews${model.renewalIncreasePct ? ` at +${model.renewalIncreasePct}%` : ""}`
      : "Term ends",
    kind: model.autoRenew ? "renewal" : "end",
  });
  if (model.autoRenew) {
    events.push({
      month: horizon,
      date: dateAtMonth(model.startDate, horizon),
      label: "Renewal term ends",
      kind: "end",
    });
  }

  let cheapestExit: Simulation["cheapestExit"] = null;
  for (let month = 1; month < term; month += 1) {
    const snap = snapshotAt(model, month);
    if (!cheapestExit || snap.walkAway < cheapestExit.cost - EPSILON) {
      cheapestExit = { month, date: snap.date, cost: snap.walkAway };
    }
  }

  const trap =
    model.autoRenew && model.renewalTermMonths > 0
      ? {
          month: Math.max(0, term - notice),
          date: dateAtMonth(model.startDate, Math.max(0, term - notice)),
          lockedAmount: model.renewalTermMonths * renewalFee(model),
          renewalMonths: model.renewalTermMonths,
        }
      : null;

  return {
    ready,
    horizon,
    points,
    events,
    cheapestExit,
    trap,
    totalIfYouStay: model.deposit + feesBetween(model, 0, term),
  };
}

export function formatMoney(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } catch {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
