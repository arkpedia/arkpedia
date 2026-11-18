-- Private aggregate membership counts only; no names, IDs or provider responses.
CREATE TABLE IF NOT EXISTS patreon_sync_audit (
  campaign_id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  counts_json TEXT NOT NULL
);
