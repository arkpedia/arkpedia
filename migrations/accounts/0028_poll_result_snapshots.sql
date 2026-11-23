CREATE TABLE poll_result_snapshot (
  poll TEXT PRIMARY KEY,
  payload TEXT,
  refreshedAt INTEGER NOT NULL DEFAULT 0,
  leaseUntil INTEGER NOT NULL
);
