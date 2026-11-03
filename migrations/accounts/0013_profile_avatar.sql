-- Profile identity is separate from replaceable cloud saves. Older clients leave it intact.
ALTER TABLE arkpedia_profile ADD COLUMN avatarId TEXT;
