CREATE TABLE sponsor_rotations (
  placement TEXT PRIMARY KEY CHECK (placement IN ('header', 'mobile-menu')),
  revision INTEGER NOT NULL,
  turns TEXT NOT NULL,
  editor TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
