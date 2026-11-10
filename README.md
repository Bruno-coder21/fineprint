# Fineprint

Turn a contract into a map you can test.

Built for the Builder.io Agent-Native Hackathon (November 2026) on the
[Agent-Native](https://www.agent-native.com) framework.

Demo video: [`public/fineprint-demo.mp4`](public/fineprint-demo.mp4)

## The problem

Nobody reads long contracts. A chatbot summary is another wall of text, and
you cannot check it.

## What Fineprint does

Drop in a PDF or Word contract. The agent reads it clause by clause, and you
get an instrument instead of a summary.

- **A heat strip of the whole contract.** One block per clause, colored by
  risk. It fills in live while the agent reads.
- **Proof for every claim.** Each finding is pinned to the exact words in the
  contract. The `add-items` action rejects any quote that is not there
  verbatim, so the agent cannot invent a finding.
- **Step 1, review the points.** One point at a time, in plain words, with the
  sentence from the contract underneath. You answer "fine by me" or "I want
  this changed".
- **Step 2, see what it costs.** A time ruler shows what you have paid, what
  you are locked into, and what it costs to walk away in any month, including
  the auto-renewal cliff. Change a term and the ruler draws the contract as
  written against the contract as proposed.
- **Step 3, get your message.** The agent drafts the negotiation message from
  exactly what you chose. You edit it and send it.

## People and agent, same actions

The page and the agent call the same `defineAction()` actions on the same SQL
state.

| Action | Used by the page | Used by the agent |
| --- | --- | --- |
| `import-contract` | Upload or paste | Import on request |
| `get-contract`, `read-sections` | Render the map | Read the contract in chunks |
| `add-items` | "Pin this" on selected text | Pin findings while mapping |
| `update-item` | "Fine by me" / "I want this changed" | Flag clauses to negotiate |
| `set-terms`, `update-term` | Levers on the ruler | Record and propose numbers |
| `simulate` | Same pure function, client side | "What if" answers, and it moves the ruler |
| `save-draft` | Edit the message | Write the message |

All money and date math lives in one pure simulator (`shared/simulate.ts`),
used by the page and by the `simulate` action. The agent never does
arithmetic of its own.

## Run it

Requires Node.js 22.22 or later.

```bash
corepack enable
pnpm install
pnpm dev
```

Open the printed local URL, choose **Continue as local dev**, connect an AI
engine (Builder.io credits or your own key), and go to **Contracts**. A sample
lease is at `public/samples/apartment-lease.pdf`.

## Pre-existing work and what is new

Pre-existing: the Agent-Native framework and its official `chat` starter
template (`@agent-native/core` 0.226.0), with the open-source libraries that
template ships with, plus `pdfjs-dist` and `mammoth` for reading files in the
browser.

New during the hackathon: the data model (`server/db`), the 13 contract
actions (`actions/`), the splitter, quote validator, and simulator
(`shared/`), the contract pages and components (`app/routes/contracts*`,
`app/components/contract/`), PDF and Word text extraction
(`app/lib/extract-text.ts`), the agent instructions
(`server/plugins/agent-chat.ts`, `AGENTS.md`), and the fictional sample
contracts. Built by Bruno Verona with an AI coding assistant.

## Security notes

- A contract is private to the account that imported it. Every action checks
  the signed-in user and scopes every query by owner.
- Uploaded files are read in the browser. Only the extracted text is sent to
  the app, and it is rendered as text, never as HTML.
- Contract text is treated as untrusted input. The agent is instructed not to
  follow instructions found inside a contract, and the destructive actions
  (`clear-map`, `delete-contract`) are not exposed to the agent at all.
- No secrets live in this repository. Local data (`data/`) and `.env` files
  are git-ignored.
- `pnpm audit` reports advisories in the dependency tree pinned by the
  framework release this was built on (`@agent-native/core` 0.226.0,
  `react-router` 8.1.0, `vite` 8.1.0). None come from code or dependencies
  added here. This is a hackathon demo run in local development: upgrade the
  framework and set `BETTER_AUTH_SECRET` and `DATABASE_URL` before deploying
  it anywhere public.

## Notes

Fineprint helps you read a contract. It is not legal advice. The sample
contracts are fictional.
