-- Independent, resumable ratings. Ranked test ballots remain intact in their original table.
CREATE TABLE skin_poll_rating (
  poll TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  skin TEXT NOT NULL CHECK(length(skin) BETWEEN 1 AND 200),
  rating INTEGER CHECK(rating IS NULL OR (typeof(rating)='integer' AND rating BETWEEN 1 AND 10)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(poll,userId,skin)
);
CREATE INDEX skin_poll_rating_results ON skin_poll_rating(poll,skin) WHERE rating IS NOT NULL;
