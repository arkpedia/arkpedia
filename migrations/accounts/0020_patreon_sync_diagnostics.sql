-- Provider health only: no member records, response bodies or credentials.
CREATE TABLE IF NOT EXISTS patreon_sync_diagnostics (
  campaign_id TEXT PRIMARY KEY,
  error_code TEXT NOT NULL,
  failed_at INTEGER NOT NULL,
  recovered_at INTEGER
);
