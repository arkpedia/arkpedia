-- Anonymous, short-lived waiting positions. No game/account identifiers or credentials.
CREATE TABLE replay_wait_queue (
  ticket INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL UNIQUE,
  readyAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX replay_wait_expiry ON replay_wait_queue(expiresAt);
