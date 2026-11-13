-- Campaign integration state is private and independent of Arkpedia accounts.
CREATE TABLE IF NOT EXISTS patreon_supporter_sync (
  campaign_id TEXT PRIMARY KEY,
  token_envelope TEXT,
  seed_fingerprint TEXT,
  snapshot_json TEXT,
  updated_at INTEGER,
  lease_id TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0
);
