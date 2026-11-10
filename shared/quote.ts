/**
 * Verbatim-quote matching shared by the server (to reject claims the contract
 * does not support) and the client (to highlight the supporting text).
 *
 * Matching ignores case, whitespace runs, and typographic quote/dash variants,
 * and maps the hit back to offsets in the original text.
 */

const CHAR_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  " ": " ",
};

export interface NormalizedText {
  norm: string;
  /** norm index -> index in the original text */
  map: number[];
}

export function normalizeWithMap(text: string): NormalizedText {
  let norm = "";
  const map: number[] = [];
  let previousWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    const raw = text.charAt(i);
    let ch = CHAR_MAP[raw] ?? raw;
    if (/\s/.test(ch)) {
      if (previousWasSpace) continue;
      ch = " ";
      previousWasSpace = true;
    } else {
      previousWasSpace = false;
    }
    const lower = ch.toLowerCase();
    norm += lower.length === 1 ? lower : ch;
    map.push(i);
  }
  return { norm, map };
}

export interface QuoteRange {
  start: number;
  end: number;
}

export const MIN_QUOTE_LENGTH = 12;

function cleanQuote(quote: string): string {
  return normalizeWithMap(quote)
    .norm.trim()
    .replace(/^["'.…\s]+|["'…\s]+$/g, "");
}

/** Offsets of `quote` inside `body`, or null when it is not there verbatim. */
export function findQuote(body: string, quote: string): QuoteRange | null {
  const needle = cleanQuote(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return null;
  const haystack = normalizeWithMap(body);
  const at = haystack.norm.indexOf(needle);
  if (at < 0) return null;
  const last = at + needle.length - 1;
  const start = haystack.map[at];
  const end = haystack.map[last];
  if (start === undefined || end === undefined) return null;
  return { start, end: end + 1 };
}
