// Local SQLite DDL (expo-sqlite). One database, two tables + meta.
// event_outbox carries every field from the Phase-2A spec; order_cache holds
// the last known server snapshot of the active order for offline validation.
export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS event_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  order_id TEXT,
  line_id TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SYNCING','SYNCED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status_time
  ON event_outbox(status, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_client_event
  ON event_outbox(client_event_id);

CREATE TABLE IF NOT EXISTS order_cache (
  cache_key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_meta (
  meta_key TEXT PRIMARY KEY,
  meta_value TEXT NOT NULL
);
`;
