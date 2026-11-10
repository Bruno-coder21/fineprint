/**
 * Turn a dropped contract file into plain text, in the browser. The file
 * itself never leaves the page: only its text goes to import-contract.
 */

export interface ExtractedContract {
  text: string;
  /** "PDF, 6 pages" and the like, for the file chip. */
  detail: string;
}

const HEADING_START =
  /^\s*(?:(?:section|article|clause|cl[aá]usula|artigo)\s+(?:\d+|[ivxlc]+)\b|\d{1,3}[.)]\s+\S)/i;

function isPageFooter(line: string): boolean {
  return (
    /^(?:page\s+)?\d+\s*(?:of|\/|de)\s*\d+$/i.test(line) ||
    /^page\s+\d+$/i.test(line)
  );
}

/** Rejoin lines that a PDF wrapped visually; keep real paragraph breaks. */
function unwrap(rawLines: string[]): string {
  // Drop running page footers, together with the gap that precedes them, so
  // a sentence that continues on the next page stays one sentence.
  const lines: string[] = [];
  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (isPageFooter(line)) {
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      continue;
    }
    lines.push(line);
  }

  const paragraphs: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) paragraphs.push(current.trim());
    current = "";
  };
  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (current && HEADING_START.test(line)) flush();
    if (!current) current = line;
    else if (current.endsWith("-") && /^[a-z]/.test(line))
      // Keep the hyphen: "then-" + "current" is "then-current", and a real
      // compound must not be glued into one word.
      current = current + line;
    else current = `${current} ${line}`;
  }
  flush();
  return paragraphs.join("\n\n");
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function extractPdf(file: File): Promise<ExtractedContract> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;

  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    let lastEndX = 0;
    let lastHeight = 10;
    for (const entry of content.items) {
      if (!("str" in entry)) continue;
      const item = entry as PdfTextItem;
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      const height = item.height || lastHeight;
      if (lastY !== null && Math.abs(y - lastY) > Math.max(2, height * 0.5)) {
        lines.push(line);
        // A gap clearly taller than one line is a paragraph break.
        if (Math.abs(lastY - y) > Math.max(height, lastHeight) * 1.75) {
          lines.push("");
        }
        line = "";
        lastEndX = 0;
      }
      if (
        line &&
        item.str &&
        x - lastEndX > height * 0.18 &&
        !line.endsWith(" ") &&
        !item.str.startsWith(" ")
      ) {
        line += " ";
      }
      line += item.str;
      lastY = y;
      lastEndX = x + item.width;
      if (item.height) lastHeight = item.height;
    }
    // A page break is not a paragraph break: let the sentence continue.
    lines.push(line);
  }

  const text = unwrap(lines);
  if (text.replace(/\s/g, "").length < 200) {
    throw new Error(
      "This PDF has no selectable text. It looks like a scan. Export it with text, or paste the contract instead.",
    );
  }
  return {
    text,
    detail: `PDF, ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`,
  };
}

async function extractDocx(file: File): Promise<ExtractedContract> {
  const mammoth = (await import("mammoth/mammoth.browser")) as unknown as {
    extractRawText: (input: {
      arrayBuffer: ArrayBuffer;
    }) => Promise<{ value: string }>;
    default?: {
      extractRawText: (input: {
        arrayBuffer: ArrayBuffer;
      }) => Promise<{ value: string }>;
    };
  };
  const extract = mammoth.extractRawText ?? mammoth.default?.extractRawText;
  if (!extract) throw new Error("Could not load the Word reader.");
  const result = await extract({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 200) {
    throw new Error("This Word file has almost no text in it.");
  }
  return { text, detail: "Word document" };
}

export const ACCEPTED_CONTRACT_FILES =
  ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export async function extractContractText(
  file: File,
): Promise<ExtractedContract> {
  const name = file.name.toLowerCase();
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("That file is over 25 MB. Try a smaller export.");
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(file);
  }
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".doc")) {
    throw new Error(
      "Old .doc files are not supported. Save it as .docx or PDF and drop it again.",
    );
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    const text = (await file.text()).trim();
    if (text.length < 200) throw new Error("That file has almost no text in it.");
    return { text, detail: "Text file" };
  }
  throw new Error("Drop a PDF, a Word .docx, or a text file.");
}

/** "Office_Lease-2027.final.pdf" -> "Office Lease 2027 final". */
export function titleFromFileName(name: string): string {
  const title = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return title.charAt(0).toUpperCase() + title.slice(1);
}
