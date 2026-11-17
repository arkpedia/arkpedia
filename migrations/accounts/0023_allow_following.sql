-- Following is separate consent from appearing in the in-game support finder.
ALTER TABLE community_account ADD COLUMN allowFollowing INTEGER NOT NULL DEFAULT 0 CHECK(allowFollowing IN (0,1));
-- Preserve only existing explicit public-collection consent, never infer it from supports.
ALTER TABLE community_account ADD COLUMN profileLink INTEGER NOT NULL DEFAULT 0 CHECK(profileLink IN (0,1));
UPDATE community_account SET allowFollowing=1,profileLink=1 WHERE EXISTS (
  SELECT 1 FROM community_friend_profile p WHERE p.userId=community_account.userId
    AND p.enabled=1 AND p.gameKey=community_account.gameKey
) AND shareTag=1 AND openRequests=1;
ALTER TABLE community_friend_profile ADD COLUMN importedAt TEXT;
UPDATE community_friend_profile SET importedAt=json_extract(snapshot,'$.account.importedAt') WHERE enabled=1;
DROP TRIGGER community_friend_profile_withdraw;
CREATE TRIGGER community_friend_profile_withdraw
AFTER UPDATE OF profileLink, gameKey ON community_account
WHEN NEW.profileLink=0 OR NEW.gameKey IS NOT OLD.gameKey
BEGIN
  UPDATE community_friend_profile SET enabled=0, gameKey=NULL, snapshot=NULL, importedAt=NULL,
    revision=revision+1, mutationId=NEW.mutationId, updatedAt=NEW.updatedAt
    WHERE userId=NEW.userId;
  DELETE FROM community_friend_operator WHERE userId=NEW.userId;
END;
CREATE INDEX community_following_directory ON community_account(allowFollowing,server,importedAt DESC,listingId);
