ALTER TABLE cloud_save ADD COLUMN personalSync INTEGER NOT NULL DEFAULT 1 CHECK(personalSync IN (0, 1));
ALTER TABLE cloud_save ADD COLUMN historySync INTEGER NOT NULL DEFAULT 0 CHECK(historySync IN (0, 1));
ALTER TABLE cloud_save ADD COLUMN mutationId TEXT;
-- Preserve the permission already granted for full imported game data.
UPDATE cloud_save SET historySync = gameSync;
CREATE TABLE pull_archive_account (
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  server TEXT NOT NULL CHECK(server IN ('en', 'jp', 'kr')), uid TEXT NOT NULL,
  doctor TEXT, readAt TEXT, updatedAt TEXT NOT NULL,
  PRIMARY KEY(userId, server, uid)
);
CREATE TABLE pull_archive_row (
  userId TEXT NOT NULL, server TEXT NOT NULL, uid TEXT NOT NULL,
  at INTEGER NOT NULL, pool TEXT NOT NULL, char TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0), star INTEGER, poolName TEXT, charName TEXT,
  PRIMARY KEY(userId, server, uid, at, pool, char),
  FOREIGN KEY(userId, server, uid) REFERENCES pull_archive_account(userId, server, uid) ON DELETE CASCADE
);
-- Extract existing opted-in histories before snapshots can be replaced by another device.
CREATE VIEW legacy_pull_sources AS
SELECT userId, json_extract(payload, '$.arkpediaAccount') AS record FROM cloud_save WHERE historySync = 1
UNION ALL
SELECT c.userId, j.value FROM cloud_save c, json_each(c.payload, '$.arkpediaOtherAccounts') j WHERE c.historySync = 1;
INSERT INTO pull_archive_account (userId, server, uid, doctor, readAt, updatedAt)
SELECT userId, json_extract(record, '$.server'), COALESCE(NULLIF(json_extract(record, '$.profile.uid'), ''), 'unknown'),
  json_extract(record, '$.doctor'), json_extract(record, '$.pulls.readAt'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM legacy_pull_sources
WHERE json_extract(record, '$.server') IN ('en','jp','kr')
  AND json_type(record, '$.pulls.rows') = 'array'
  AND (NULLIF(json_extract(record, '$.profile.uid'), '') IS NULL OR
    (length(json_extract(record, '$.profile.uid')) BETWEEN 1 AND 32 AND CAST(json_extract(record, '$.profile.uid') AS TEXT) NOT GLOB '*[^0-9]*'))
ON CONFLICT(userId, server, uid) DO UPDATE SET readAt = max(COALESCE(readAt, ''), COALESCE(excluded.readAt, ''));
INSERT INTO pull_archive_row (userId, server, uid, at, pool, char, count, star, poolName, charName)
WITH batches AS (
SELECT s.userId, a.server, a.uid,
  CASE WHEN json_extract(j.value, '$.at') >= 1e11 THEN CAST(json_extract(j.value, '$.at') / 1000 AS INTEGER) ELSE json_extract(j.value, '$.at') END AS at,
  json_extract(j.value, '$.pool') AS pool, json_extract(j.value, '$.char') AS char,
  count(*) AS n, max(json_extract(j.value, '$.star')) AS star,
  json_extract(s.record, '$.pulls.pools.' || json_extract(j.value, '$.pool')) AS poolName,
  json_extract(s.record, '$.pulls.names.' || json_extract(j.value, '$.char')) AS charName
FROM (SELECT DISTINCT userId, record FROM legacy_pull_sources) s
JOIN pull_archive_account a ON a.userId = s.userId AND a.server = json_extract(s.record, '$.server') AND a.uid = COALESCE(NULLIF(json_extract(s.record, '$.profile.uid'), ''), 'unknown')
JOIN json_each(s.record, '$.pulls.rows') j
WHERE json_extract(j.value, '$.at') > 0 AND json_type(j.value, '$.pool') = 'text' AND json_type(j.value, '$.char') = 'text'
GROUP BY s.userId, s.record, a.server, a.uid, at, pool, char
)
SELECT userId, server, uid, at, pool, char, max(n), max(star), max(poolName), max(charName)
FROM batches GROUP BY userId, server, uid, at, pool, char;
DROP VIEW legacy_pull_sources;
-- During rollout an older Worker can still write snapshots. Its combined consent
-- must remain authoritative until the new handler (which supplies a nonce) serves it.
CREATE TRIGGER legacy_cloud_game_consent AFTER UPDATE OF gameSync, payload ON cloud_save
WHEN NEW.mutationId IS OLD.mutationId
BEGIN
  UPDATE cloud_save SET historySync = NEW.gameSync WHERE userId = NEW.userId;
  DELETE FROM pull_archive_account WHERE userId = NEW.userId AND NEW.gameSync = 0;
END;
