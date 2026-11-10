/** Vocabulary shared by actions and the UI. */

export const ITEM_KINDS = [
  "payment",
  "deadline",
  "obligation",
  "right",
  "penalty",
  "renewal",
  "termination",
  "liability",
  "other",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const RISKS = ["red", "yellow", "green"] as const;
export type Risk = (typeof RISKS)[number];

export const FAVORS = ["me", "them", "both"] as const;
export type Favors = (typeof FAVORS)[number];

export const ITEM_STATUSES = ["open", "ok", "negotiate"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const RISK_WEIGHT: Record<Risk, number> = { red: 3, yellow: 2, green: 1 };

/** The most severe risk in a list, or null when the list is empty. */
export function worstRisk(risks: Risk[]): Risk | null {
  if (risks.includes("red")) return "red";
  if (risks.includes("yellow")) return "yellow";
  if (risks.includes("green")) return "green";
  return null;
}

export const RISK_LABEL: Record<Risk, string> = {
  red: "Watch out",
  yellow: "Worth a look",
  green: "Fine",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  payment: "Payment",
  deadline: "Deadline",
  obligation: "You must",
  right: "You may",
  penalty: "Penalty",
  renewal: "Renewal",
  termination: "Exit",
  liability: "Liability",
  other: "Note",
};
