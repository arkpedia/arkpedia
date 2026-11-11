-- Keep missing historical ranks unknown. Mastery already implies rank 7 at read time.
ALTER TABLE community_operator ADD COLUMN skillLevel INTEGER CHECK(skillLevel IS NULL OR skillLevel BETWEEN 1 AND 7);
