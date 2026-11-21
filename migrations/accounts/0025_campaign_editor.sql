CREATE TABLE campaign_editor_revisions (
  campaign_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  follows_release INTEGER NOT NULL,
  campaign_json TEXT,
  PRIMARY KEY(campaign_id, revision)
);
CREATE TABLE campaign_editor_art (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  bytes BLOB NOT NULL
);
