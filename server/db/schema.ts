import { sql } from "drizzle-orm";
import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

/** A contract is private to the person who imported it. */
export const contracts = pgTable("contracts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  rawText: text("raw_text").notNull(),
  myParty: text("my_party").notNull().default("You"),
  counterparty: text("counterparty").notNull().default("The other party"),
  currency: text("currency").notNull().default("USD"),
  negotiationDraft: text("negotiation_draft"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

/** The contract cut into numbered clauses at import time. */
export const sections = pgTable("contract_sections", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  idx: integer("idx").notNull(),
  heading: text("heading").notNull(),
  body: text("body").notNull(),
  reviewed: integer("reviewed").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

/** One pinned finding. `quote` is verbatim text from its section. */
export const items = pgTable("contract_items", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  sectionIdx: integer("section_idx").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  plain: text("plain").notNull(),
  quote: text("quote").notNull(),
  risk: text("risk").notNull(),
  favors: text("favors").notNull().default("both"),
  status: text("status").notNull().default("open"),
  note: text("note"),
  author: text("author").notNull().default("agent"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

/** The numbers that drive the simulator, with an optional proposed value. */
export const terms = pgTable(
  "contract_terms",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    proposedValue: text("proposed_value"),
    sectionIdx: integer("section_idx"),
    quote: text("quote"),
    author: text("author").notNull().default("agent"),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
  },
  (table) => [
    uniqueIndex("contract_terms_contract_key_idx").on(
      table.contractId,
      table.key,
    ),
  ],
);
