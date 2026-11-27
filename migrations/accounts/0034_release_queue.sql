CREATE TABLE release_queue (
  source TEXT PRIMARY KEY,
  base TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  pull_request INTEGER NOT NULL,
  title TEXT NOT NULL,
  paths TEXT NOT NULL CHECK (json_valid(paths)),
  note TEXT CHECK (note IS NULL OR json_valid(note)),
  state TEXT NOT NULL CHECK (state IN ('queued', 'publishing', 'published', 'needs_review')),
  target TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  actor TEXT NOT NULL
);

CREATE UNIQUE INDEX release_queue_one_publication ON release_queue (state) WHERE state = 'publishing';
