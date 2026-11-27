CREATE TABLE page_visibility (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'unlisted' CHECK (mode IN ('unlisted', 'listed', 'scheduled')),
  show_at INTEGER,
  hide_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  editor TEXT,
  CHECK (
    (mode = 'scheduled' AND (show_at IS NOT NULL OR hide_at IS NOT NULL)
      AND (show_at IS NULL OR hide_at IS NULL OR show_at < hide_at))
    OR (mode IN ('unlisted', 'listed') AND show_at IS NULL AND hide_at IS NULL)
  )
);

INSERT INTO page_visibility (id) VALUES ('ccb');
