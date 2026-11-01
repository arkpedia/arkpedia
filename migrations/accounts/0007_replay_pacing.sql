-- Anonymous, short-lived downloader coordination; no game/account identity or payload.
CREATE TABLE replay_pacing (
  id TEXT PRIMARY KEY NOT NULL,
  nextAt INTEGER NOT NULL,
  grantId TEXT NOT NULL
);
CREATE INDEX replay_pacing_expiry ON replay_pacing(nextAt);
INSERT INTO replay_pacing(id, nextAt, grantId) VALUES ('global', 0, '');
