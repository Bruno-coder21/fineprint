import type { ItemStatus, Risk } from "@shared/domain";

export interface ContractSection {
  idx: number;
  heading: string;
  chars: number;
  reviewed: boolean;
  itemCount: number;
  risk: Risk | null;
  body?: string;
}

export interface ContractItem {
  id: string;
  sectionIdx: number;
  kind: string;
  title: string;
  plain: string;
  quote: string;
  risk: string;
  favors: string;
  status: string;
  note: string | null;
  author: string;
}

export interface ContractTerm {
  key: string;
  value: string;
  proposedValue: string | null;
  sectionIdx: number | null;
  quote: string | null;
  author: string;
}

export interface ContractSummary {
  id: string;
  title: string;
  myParty: string;
  counterparty: string;
  currency: string;
  negotiationDraft: string | null;
  createdAt: string;
}

export interface ContractData {
  contract: ContractSummary;
  coverage: { reviewed: number; total: number };
  sections: ContractSection[];
  items: ContractItem[];
  terms: ContractTerm[];
}

export function asRisk(value: string | null | undefined): Risk | "none" {
  return value === "red" || value === "yellow" || value === "green"
    ? value
    : "none";
}

export function asStatus(value: string): ItemStatus {
  return value === "ok" || value === "negotiate" ? value : "open";
}

/** Short party name: "Tenant (Jordan Rivera)" -> "Tenant". */
export function shortParty(name: string, max = 26): string {
  const trimmed = (
    name.replace(/\s*\(.*\)\s*$/, "").trim() || name.trim()
  ).replace(/,?\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|Ltda\.?|S\.A\.|Corp\.?)$/i, "");
  if (trimmed.length <= max) return trimmed;
  const words = trimmed.split(/\s+/);
  let short = "";
  for (const word of words) {
    if ((short ? `${short} ${word}` : word).length > max) break;
    short = short ? `${short} ${word}` : word;
  }
  return short || `${trimmed.slice(0, max - 1).trimEnd()}\u2026`;
}
