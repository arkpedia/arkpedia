-- Separate from ranked outfit ballots; anonymous identities are browser-scoped.
CREATE TABLE pull_poll_ballot (
  poll TEXT NOT NULL,
  voter TEXT NOT NULL,
  userId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  choices TEXT NOT NULL CHECK(json_valid(choices) AND json_type(choices)='object'),
  revision INTEGER NOT NULL CHECK(revision > 0),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(poll,voter)
);
CREATE TABLE pull_poll_write_limit (
  voter TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
