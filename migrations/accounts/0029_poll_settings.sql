CREATE TABLE poll_settings (
  id TEXT PRIMARY KEY,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  results TEXT NOT NULL DEFAULT 'live' CHECK (results IN ('live','closed','hidden')),
  closes_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  editor TEXT
);
INSERT INTO poll_settings (id) VALUES ('pull-or-skip'), ('favourite-skins'), ('power-scale');
