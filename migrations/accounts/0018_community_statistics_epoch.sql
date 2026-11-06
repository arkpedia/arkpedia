-- Routine imports can wait for the daily snapshot. Withdrawals/deletions cannot.
CREATE TABLE community_statistics_epoch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO community_statistics_epoch(id, revision) VALUES (1, 0);

CREATE TRIGGER community_statistics_consent_removed
AFTER UPDATE OF stats, server, gameKey ON community_account
WHEN OLD.stats = 1 AND (NEW.stats != 1 OR NEW.server != OLD.server OR NEW.gameKey IS NOT OLD.gameKey)
BEGIN
  UPDATE community_statistics_epoch SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER community_statistics_account_deleted
AFTER DELETE ON community_account WHEN OLD.stats = 1
BEGIN
  UPDATE community_statistics_epoch SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER community_statistics_archive_deleted
AFTER DELETE ON auto_deploy
WHEN EXISTS (SELECT 1 FROM community_account WHERE userId = OLD.userId AND stats = 1)
BEGIN
  UPDATE community_statistics_epoch SET revision = revision + 1 WHERE id = 1;
END;
