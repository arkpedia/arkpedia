-- Existing identities, linked logins and saves stay attached to the same user ID.
CREATE TABLE arkpedia_profile (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  usernameKey TEXT NOT NULL UNIQUE,
  friendTag TEXT,
  friendServer TEXT CHECK(friendServer IN ('en', 'jp', 'kr')),
  updatedAt TEXT NOT NULL,
  CHECK((friendTag IS NULL) = (friendServer IS NULL))
);
ALTER TABLE cloud_save ADD COLUMN paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0, 1));
-- Provider names/photos are not an Arkpedia profile or a chosen public identity.
UPDATE "user" SET name = 'Arkpedia user', image = NULL;
