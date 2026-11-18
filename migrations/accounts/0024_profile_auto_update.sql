-- Existing direct links keep manual publication until their owner opts in.
ALTER TABLE community_friend_profile ADD COLUMN autoUpdate INTEGER NOT NULL DEFAULT 0 CHECK(autoUpdate IN (0,1));

DROP TRIGGER community_friend_profile_withdraw;
CREATE TRIGGER community_friend_profile_withdraw
AFTER UPDATE OF profileLink, gameKey ON community_account
WHEN NEW.profileLink=0 OR NEW.gameKey IS NOT OLD.gameKey
BEGIN
  UPDATE community_friend_profile SET enabled=0, gameKey=NULL, snapshot=NULL, importedAt=NULL, autoUpdate=0,
    revision=revision+1, mutationId=NEW.mutationId, updatedAt=NEW.updatedAt
    WHERE userId=NEW.userId;
  DELETE FROM community_friend_operator WHERE userId=NEW.userId;
END;
