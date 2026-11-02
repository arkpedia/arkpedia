-- Actual skill ranks of the three explicitly shared equipped supports only.
ALTER TABLE community_support ADD COLUMN skillLevel INTEGER;
ALTER TABLE community_support ADD COLUMN skillMasteries TEXT;
