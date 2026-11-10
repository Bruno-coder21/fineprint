/** Deterministic contract splitter: text in, numbered sections out. */

export interface SplitSection {
  idx: number;
  heading: string;
  body: string;
}

const HEADING_LINE =
  /^\s*(?:(?:section|article|clause|cl[aá]usula|artigo)\s+(?:\d+|[ivxlc]+)\b|\d{1,3}\.\s+\S|\d{1,3}\)\s+\S)/i;

function headingFrom(block: string, fallback: string): string {
  const firstLine = (block.split("\n")[0] ?? "").trim();
  const withoutNumber = firstLine
    .replace(
      /^(?:(?:section|article|clause|cl[aá]usula|artigo)\s+(?:\d+|[ivxlc]+)\s*[.:\-–—]?\s*|\d{1,3}[.)]\s+)/i,
      "",
    )
    .trim();
  const sentence = withoutNumber.split(/(?<=[.:])\s/)[0] ?? withoutNumber;
  const raw = sentence.replace(/[.:]\s*$/, "").trim();
  if (!raw) return fallback;
  // Contracts shout their headings; the map does not need to.
  const cleaned =
    raw === raw.toUpperCase()
      ? raw
          .toLowerCase()
          .replace(/(^|[\s\-/(])([a-z\u00e0-\u00ff])/g, (_m, lead, ch) => lead + ch.toUpperCase())
          .replace(/\b(And|Of|By|The|For|To|In|On|Or|De|Da|Do|E)\b/g, (word, _w, offset) =>
            offset === 0 ? word : word.toLowerCase(),
          )
      : raw;
  return cleaned.length > 64 ? `${cleaned.slice(0, 61).trimEnd()}...` : cleaned;
}

function splitByHeadings(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (HEADING_LINE.test(line) && current.join("").trim().length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.join("").trim().length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function splitByParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > 700) {
      blocks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export function splitContract(rawText: string): SplitSection[] {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  let blocks = splitByHeadings(text);
  if (blocks.length < 4) blocks = splitByParagraphs(text);
  const trimmed = blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 400);
  // An unnumbered opening block becomes section 0, so section numbers line
  // up with the contract's own clause numbers.
  const hasPreamble =
    trimmed.length > 1 &&
    !HEADING_LINE.test(trimmed[0] ?? "") &&
    HEADING_LINE.test(trimmed[1] ?? "");
  const offset = hasPreamble ? 0 : 1;
  return trimmed.map((body, index) => ({
    idx: index + offset,
    heading:
      hasPreamble && index === 0
        ? "Preamble"
        : headingFrom(body, `Part ${index + offset}`),
    body,
  }));
}
