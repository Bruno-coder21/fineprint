import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "contracts",
      sql: `CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  my_party TEXT NOT NULL DEFAULT 'You',
  counterparty TEXT NOT NULL DEFAULT 'The other party',
  currency TEXT NOT NULL DEFAULT 'USD',
  negotiation_draft TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS contract_sections (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS contract_items (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  section_idx INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  plain TEXT NOT NULL,
  quote TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('red', 'yellow', 'green')),
  favors TEXT NOT NULL DEFAULT 'both' CHECK (favors IN ('me', 'them', 'both')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ok', 'negotiate')),
  note TEXT,
  author TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS contract_terms (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  proposed_value TEXT,
  section_idx INTEGER,
  quote TEXT,
  author TEXT NOT NULL DEFAULT 'agent',
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_terms_contract_key_idx ON contract_terms (contract_id, key);
CREATE INDEX IF NOT EXISTS contracts_owner_created_idx ON contracts (owner_email, created_at);
CREATE INDEX IF NOT EXISTS contract_sections_contract_idx ON contract_sections (contract_id, idx);
CREATE INDEX IF NOT EXISTS contract_items_contract_idx ON contract_items (contract_id, section_idx)`,
    },
  ],
  { table: "fineprint_app_migrations" },
);
