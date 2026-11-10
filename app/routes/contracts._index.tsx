import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { SAMPLE_CONTRACTS } from "@shared/samples";
import {
  IconArrowRight,
  IconFileText,
  IconFileUpload,
  IconX,
} from "@tabler/icons-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { MiniHeatStrip } from "@/components/contract/HeatStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { APP_TITLE } from "@/lib/app-config";
import {
  ACCEPTED_CONTRACT_FILES,
  extractContractText,
  titleFromFileName,
} from "@/lib/extract-text";
import { cn } from "@/lib/utils";

export function meta() {
  return [
    { title: `${APP_TITLE} - See what you are signing` },
    {
      name: "description",
      content:
        "Turn any contract into a map you can test: a heat strip of every clause, who pays whom, and what it costs to leave in any month.",
    },
  ];
}

export default function ContractsIndexRoute() {
  const navigate = useNavigate();
  const { data, isPending } = useActionQuery("list-contracts", {});
  const [title, setTitle] = useState("");
  const [myParty, setMyParty] = useState("");
  const [text, setText] = useState("");
  const [importingSample, setImportingSample] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; detail: string } | null>(
    null,
  );
  const [reading, setReading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function readFile(picked: File | undefined) {
    if (!picked) return;
    setReading(picked.name);
    try {
      const extracted = await extractContractText(picked);
      setText(extracted.text);
      setFile({ name: picked.name, detail: extracted.detail });
      setTitle((current) => current.trim() || titleFromFileName(picked.name));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read that file.",
      );
    } finally {
      setReading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  const importContract = useActionMutation("import-contract", {
    onError: (error) => {
      setImportingSample(null);
      toast.error(actionErrorMessage(error) ?? "Could not import the contract.");
    },
    onSuccess: (result) => {
      navigate(`/contracts/${(result as { id: string }).id}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim().length < 200) {
      toast.error("Paste the full contract text (at least a few paragraphs).");
      return;
    }
    importContract.mutate({
      title: title.trim() || "Untitled contract",
      text,
      ...(myParty.trim() ? { myParty: myParty.trim() } : {}),
    });
  }

  const contracts = data?.contracts ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          See what you are signing.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Drop in a contract. The agent reads every clause and pins what
          matters to the exact words that say it. You get a map you can test: drag
          through time, see what leaving costs each month, and negotiate with
          the numbers in front of you.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="flex flex-col gap-3"
        >
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_CONTRACT_FILES}
            className="sr-only"
            aria-label="Contract file"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <IconFileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {file.detail}, {text.length.toLocaleString("en-US")}{" "}
                  characters read
                </span>
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Remove file"
                onClick={() => {
                  setFile(null);
                  setText("");
                }}
              >
                <IconX className="size-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading != null}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dragging
                  ? "border-foreground bg-muted"
                  : "border-border hover:border-foreground/40 hover:bg-muted/50",
              )}
            >
              <IconFileUpload
                className="size-7 text-muted-foreground"
                strokeWidth={1.6}
              />
              <span className="text-sm font-medium">
                {reading
                  ? `Reading ${reading}...`
                  : "Drop a PDF or Word file here"}
              </span>
              <span className="text-xs text-muted-foreground">
                or click to choose one. The file is read in your browser.
              </span>
            </button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-title">Name</Label>
              <Input
                id="contract-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Office lease, 2027"
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-party">You are</Label>
              <Input
                id="contract-party"
                value={myParty}
                onChange={(event) => setMyParty(event.target.value)}
                placeholder="the Tenant"
                maxLength={120}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contract-text">
              {file ? "Text read from the file" : "Or paste the text"}
            </Label>
            <Textarea
              id="contract-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the whole contract here."
              rows={file ? 9 : 6}
              className="fineprint-contract-text resize-y text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={importContract.isPending || text.trim().length === 0}
              className="gap-1.5"
            >
              Open the map
              <IconArrowRight className="size-4" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Not legal advice. Your text stays in this workspace.
            </p>
          </div>
        </form>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              No contract at hand? Try one, or{" "}
              <a
                href="/samples/apartment-lease.pdf"
                download
                className="underline underline-offset-4 hover:text-foreground"
              >
                download the lease as a PDF
              </a>{" "}
              and drop it in
            </h2>
            <div className="flex flex-col gap-2">
              {SAMPLE_CONTRACTS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  disabled={importContract.isPending}
                  onClick={() => {
                    setImportingSample(sample.id);
                    importContract.mutate({
                      title: sample.title,
                      text: sample.text,
                      myParty: sample.myParty,
                      counterparty: sample.counterparty,
                    });
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <IconFileText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {sample.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {importingSample === sample.id
                        ? "Opening..."
                        : sample.blurb}
                    </span>
                  </span>
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>

          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : contracts.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Your contracts
              </h2>
              <ul className="flex flex-col gap-2">
                {contracts.map((contract) => (
                  <li key={contract.id}>
                    <Link
                      to={`/contracts/${contract.id}`}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">
                          {contract.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {contract.itemCount === 0
                            ? "Not mapped yet"
                            : `${contract.redCount} to watch`}
                        </span>
                      </span>
                      <MiniHeatStrip strip={contract.strip} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
