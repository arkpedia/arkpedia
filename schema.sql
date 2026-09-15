CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  operator_name TEXT NOT NULL,
  power NUMERIC(3,1),
  unrated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ratings_operator ON ratings(operator_name);
CREATE INDEX IF NOT EXISTS idx_ratings_submission ON ratings(submission_id);
