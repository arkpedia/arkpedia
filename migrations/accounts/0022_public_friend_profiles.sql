-- A separate, explicit opt-in. Anonymous statistics never authorize an identified roster.
CREATE TABLE community_friend_profile (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES community_account(userId) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  gameKey TEXT,
  snapshot TEXT CHECK(snapshot IS NULL OR (length(snapshot)<=500000 AND json_valid(snapshot))),
  mutationId TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  CHECK((enabled=0 AND gameKey IS NULL AND snapshot IS NULL) OR
        (enabled=1 AND gameKey IS NOT NULL AND snapshot IS NOT NULL))
);
CREATE TABLE community_friend_operator (
  userId TEXT NOT NULL REFERENCES community_friend_profile(userId) ON DELETE CASCADE,
  operator TEXT NOT NULL CHECK(length(operator) BETWEEN 1 AND 200),
  PRIMARY KEY(userId,operator)
);
CREATE INDEX community_friend_operator_lookup ON community_friend_operator(operator,userId);
-- Keep a revision tombstone: an earlier in-flight publication cannot undo withdrawal.
CREATE TRIGGER community_friend_profile_withdraw
AFTER UPDATE OF shareTag, openRequests, gameKey ON community_account
WHEN NEW.shareTag=0 OR NEW.openRequests=0 OR NEW.gameKey IS NOT OLD.gameKey
BEGIN
  UPDATE community_friend_profile SET enabled=0, gameKey=NULL, snapshot=NULL,
    revision=revision+1, mutationId=NEW.mutationId, updatedAt=NEW.updatedAt
    WHERE userId=NEW.userId;
  DELETE FROM community_friend_operator WHERE userId=NEW.userId;
END;
