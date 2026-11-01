-- Separate, bounded Preview replay archive. Existing identities and snapshots are untouched.
CREATE TABLE auto_deploy (
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL, stageId TEXT NOT NULL, fingerprint TEXT NOT NULL,
  hash TEXT NOT NULL, payload TEXT NOT NULL, bytes INTEGER NOT NULL,
  PRIMARY KEY (userId, namespace, stageId)
);
CREATE TABLE auto_deploy_usage (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  records INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER auto_deploy_insert AFTER INSERT ON auto_deploy BEGIN
  INSERT INTO auto_deploy_usage(userId,records,bytes) VALUES(NEW.userId,1,NEW.bytes)
    ON CONFLICT(userId) DO UPDATE SET records=records+1, bytes=bytes+NEW.bytes;
  SELECT CASE WHEN (SELECT records>3000 OR bytes>33554432 FROM auto_deploy_usage WHERE userId=NEW.userId)
    THEN RAISE(ABORT,'ARKPEDIA_REPLAY_QUOTA') END;
END;
CREATE TRIGGER auto_deploy_update AFTER UPDATE ON auto_deploy BEGIN
  UPDATE auto_deploy_usage SET bytes=bytes+NEW.bytes-OLD.bytes WHERE userId=NEW.userId;
  SELECT CASE WHEN (SELECT bytes>33554432 FROM auto_deploy_usage WHERE userId=NEW.userId)
    THEN RAISE(ABORT,'ARKPEDIA_REPLAY_QUOTA') END;
END;
CREATE TRIGGER auto_deploy_delete AFTER DELETE ON auto_deploy BEGIN
  UPDATE auto_deploy_usage SET records=records-1,bytes=bytes-OLD.bytes WHERE userId=OLD.userId;
END;
CREATE TRIGGER auto_deploy_consent AFTER UPDATE OF gameSync ON cloud_save WHEN NEW.gameSync=0 BEGIN
  DELETE FROM auto_deploy WHERE userId=NEW.userId;
END;
CREATE TRIGGER auto_deploy_save_delete AFTER DELETE ON cloud_save BEGIN
  DELETE FROM auto_deploy WHERE userId=OLD.userId;
END;
