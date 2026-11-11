-- Unknown levels in older contributions cannot establish module eligibility.
ALTER TABLE community_operator ADD COLUMN level INTEGER CHECK(level IS NULL OR level BETWEEN 1 AND 90);
