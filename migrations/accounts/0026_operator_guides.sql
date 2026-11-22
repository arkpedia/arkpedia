CREATE TABLE operator_guide_edits (
  operator_id TEXT NOT NULL,
  field TEXT NOT NULL,
  revision INTEGER NOT NULL,
  value_json TEXT,
  editor TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (operator_id, field)
);
