-- Existing account choices and saves stay intact. New accounts must review all
-- three categories before the API accepts any snapshot or pull archive upload.
ALTER TABLE cloud_save ADD COLUMN syncReviewed INTEGER NOT NULL DEFAULT 0 CHECK(syncReviewed IN (0, 1));
UPDATE cloud_save SET syncReviewed = 1
WHERE EXISTS (SELECT 1 FROM arkpedia_profile WHERE arkpedia_profile.userId = cloud_save.userId);
