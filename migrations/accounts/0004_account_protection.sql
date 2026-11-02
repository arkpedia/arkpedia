-- Additive Preview hardening. Preserve existing users, sessions, saves and archives.
CREATE TABLE account_request_limit (
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  operation TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL,
  PRIMARY KEY(userId, operation)
);
CREATE TABLE pull_archive_usage (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accounts INTEGER NOT NULL DEFAULT 0, pulls INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0
);
-- Existing archives above a new quota are retained. Only further growth is refused.
INSERT INTO pull_archive_usage (userId, accounts, pulls, bytes)
SELECT u.id, (SELECT count(*) FROM pull_archive_account WHERE userId = u.id),
  COALESCE((SELECT sum(count) FROM pull_archive_row WHERE userId = u.id), 0),
  COALESCE((SELECT sum(length(CAST(COALESCE(r.server, '') AS BLOB)) + length(CAST(COALESCE(r.uid, '') AS BLOB)) + length(CAST(COALESCE(r.pool, '') AS BLOB)) + length(CAST(COALESCE(r.char, '') AS BLOB)) + length(CAST(COALESCE(r.poolName, '') AS BLOB)) + length(CAST(COALESCE(r.charName, '') AS BLOB)) + 80) FROM pull_archive_row r WHERE userId = u.id), 0)
FROM "user" u;
CREATE TRIGGER archive_account_budget_insert AFTER INSERT ON pull_archive_account BEGIN
  INSERT INTO pull_archive_usage (userId, accounts) VALUES (NEW.userId, 1)
    ON CONFLICT(userId) DO UPDATE SET accounts = accounts + 1;
  SELECT CASE WHEN (SELECT accounts FROM pull_archive_usage WHERE userId = NEW.userId) > 64
    THEN RAISE(ABORT, 'ARKPEDIA_ARCHIVE_QUOTA') END;
END;
CREATE TRIGGER archive_account_budget_delete AFTER DELETE ON pull_archive_account BEGIN
  UPDATE pull_archive_usage SET accounts = accounts - 1 WHERE userId = OLD.userId;
END;
CREATE TRIGGER archive_row_budget_insert AFTER INSERT ON pull_archive_row BEGIN
  INSERT INTO pull_archive_usage (userId, pulls, bytes) VALUES (NEW.userId, NEW.count, length(CAST(COALESCE(NEW.server, '') AS BLOB)) + length(CAST(COALESCE(NEW.uid, '') AS BLOB)) + length(CAST(COALESCE(NEW.pool, '') AS BLOB)) + length(CAST(COALESCE(NEW.char, '') AS BLOB)) + length(CAST(COALESCE(NEW.poolName, '') AS BLOB)) + length(CAST(COALESCE(NEW.charName, '') AS BLOB)) + 80)
    ON CONFLICT(userId) DO UPDATE SET pulls = pulls + excluded.pulls, bytes = bytes + excluded.bytes;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM pull_archive_usage WHERE userId = NEW.userId AND (pulls > 100000 OR bytes > 16777216))
    THEN RAISE(ABORT, 'ARKPEDIA_ARCHIVE_QUOTA') END;
END;
CREATE TRIGGER archive_row_budget_update AFTER UPDATE ON pull_archive_row BEGIN
  UPDATE pull_archive_usage SET pulls = pulls + NEW.count - OLD.count,
    bytes = bytes + (length(CAST(COALESCE(NEW.server, '') AS BLOB)) + length(CAST(COALESCE(NEW.uid, '') AS BLOB)) + length(CAST(COALESCE(NEW.pool, '') AS BLOB)) + length(CAST(COALESCE(NEW.char, '') AS BLOB)) + length(CAST(COALESCE(NEW.poolName, '') AS BLOB)) + length(CAST(COALESCE(NEW.charName, '') AS BLOB)) + 80) - (length(CAST(COALESCE(OLD.server, '') AS BLOB)) + length(CAST(COALESCE(OLD.uid, '') AS BLOB)) + length(CAST(COALESCE(OLD.pool, '') AS BLOB)) + length(CAST(COALESCE(OLD.char, '') AS BLOB)) + length(CAST(COALESCE(OLD.poolName, '') AS BLOB)) + length(CAST(COALESCE(OLD.charName, '') AS BLOB)) + 80) WHERE userId = NEW.userId;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM pull_archive_usage WHERE userId = NEW.userId
    AND ((pulls > 100000 AND NEW.count > OLD.count) OR (bytes > 16777216 AND (length(CAST(COALESCE(NEW.server, '') AS BLOB)) + length(CAST(COALESCE(NEW.uid, '') AS BLOB)) + length(CAST(COALESCE(NEW.pool, '') AS BLOB)) + length(CAST(COALESCE(NEW.char, '') AS BLOB)) + length(CAST(COALESCE(NEW.poolName, '') AS BLOB)) + length(CAST(COALESCE(NEW.charName, '') AS BLOB)) + 80) > (length(CAST(COALESCE(OLD.server, '') AS BLOB)) + length(CAST(COALESCE(OLD.uid, '') AS BLOB)) + length(CAST(COALESCE(OLD.pool, '') AS BLOB)) + length(CAST(COALESCE(OLD.char, '') AS BLOB)) + length(CAST(COALESCE(OLD.poolName, '') AS BLOB)) + length(CAST(COALESCE(OLD.charName, '') AS BLOB)) + 80))))
    THEN RAISE(ABORT, 'ARKPEDIA_ARCHIVE_QUOTA') END;
END;
CREATE TRIGGER archive_row_budget_delete AFTER DELETE ON pull_archive_row BEGIN
  UPDATE pull_archive_usage SET pulls = pulls - OLD.count, bytes = bytes - (length(CAST(COALESCE(OLD.server, '') AS BLOB)) + length(CAST(COALESCE(OLD.uid, '') AS BLOB)) + length(CAST(COALESCE(OLD.pool, '') AS BLOB)) + length(CAST(COALESCE(OLD.char, '') AS BLOB)) + length(CAST(COALESCE(OLD.poolName, '') AS BLOB)) + length(CAST(COALESCE(OLD.charName, '') AS BLOB)) + 80) WHERE userId = OLD.userId;
END;
