import { EXIT_TYPES, TERM_DEFS, type TermKey } from "../../shared/simulate.js";

/** Normalize a term value for storage, or explain why it is not valid. */
export function normalizeTermValue(
  key: TermKey,
  raw: string,
): { value: string } | { error: string } {
  const text = String(raw).trim();
  const def = TERM_DEFS[key];
  if (def.unit === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? { value: text }
      : { error: `${key} must be a date like 2026-12-01.` };
  }
  if (def.unit === "bool") {
    if (/^(true|yes|1)$/i.test(text)) return { value: "true" };
    if (/^(false|no|0)$/i.test(text)) return { value: "false" };
    return { error: `${key} must be true or false.` };
  }
  if (def.unit === "enum") {
    return (EXIT_TYPES as readonly string[]).includes(text)
      ? { value: text }
      : { error: `${key} must be one of: ${EXIT_TYPES.join(", ")}.` };
  }
  const parsed = Number(text.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: `${key} must be a non-negative number.` };
  }
  return { value: String(parsed) };
}
