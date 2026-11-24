ALTER TABLE poll_settings ADD COLUMN closed_placement TEXT NOT NULL DEFAULT 'auto'
  CHECK (closed_placement IN ('auto', 'featured', 'archive'));
