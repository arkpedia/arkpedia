-- Private derived replay metadata; public reads require the existing community statistics opt-in.
-- Replay op codes: 0 deploy, 1 retreat, 2 manually recorded skill activation.
-- Each archive contains only the current saved run for a stage, never its farming frequency.
CREATE TABLE auto_deploy_summary (
  userId TEXT NOT NULL, namespace TEXT NOT NULL, stageId TEXT NOT NULL, units TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(userId,namespace,stageId),
  FOREIGN KEY(userId,namespace,stageId) REFERENCES auto_deploy(userId,namespace,stageId) ON DELETE CASCADE
);
CREATE TABLE ranked_poll_ballot (
  poll TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  choices TEXT NOT NULL CHECK(json_valid(choices) AND json_type(choices)='array' AND json_array_length(choices) IN (0,5)),
  revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(poll,userId)
);

CREATE TRIGGER auto_deploy_summary_insert AFTER INSERT ON auto_deploy BEGIN
  INSERT INTO auto_deploy_summary(userId,namespace,stageId,units) VALUES(NEW.userId,NEW.namespace,NEW.stageId,
(
  WITH squad AS (
    SELECT COALESCE(json_extract(value,'$.charId'),
      CASE WHEN instr(json_extract(value,'$.skinId'),'@')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'@')-1)
           WHEN instr(json_extract(value,'$.skinId'),'#')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'#')-1)
           ELSE json_extract(value,'$.skinId') END) charId,
      CASE WHEN json_extract(value,'$.skillIndex') BETWEEN 0 AND 2 THEN json_extract(value,'$.skillIndex') END skill
    FROM json_each(NEW.payload,'$.journal.squad') WHERE type='object'
  ), actions AS (
    SELECT json_extract(value,'$.signiture.charId') charId,
      sum(json_extract(value,'$.op')=0) deployments,sum(json_extract(value,'$.op')=2) activations
    FROM json_each(NEW.payload,'$.journal.logs') WHERE type='object' GROUP BY charId
  ), units AS (SELECT charId FROM squad UNION SELECT charId FROM actions),
  bounded_units AS (SELECT charId FROM units WHERE charId GLOB 'char_*' AND length(charId)<=100 ORDER BY charId LIMIT 64)
  SELECT COALESCE(json_group_array(json_object('charId',u.charId,'skill',s.skill,'squad',CASE WHEN s.charId IS NULL THEN 0 ELSE 1 END,
    'deployed',CASE WHEN a.deployments>0 THEN 1 ELSE 0 END,'deployments',COALESCE(a.deployments,0),'activations',COALESCE(a.activations,0))),'[]')
  FROM bounded_units u LEFT JOIN (SELECT charId,max(skill) skill FROM squad GROUP BY charId) s ON s.charId=u.charId LEFT JOIN actions a ON a.charId=u.charId
  WHERE u.charId GLOB 'char_*'
))
  ON CONFLICT(userId,namespace,stageId) DO UPDATE SET units=excluded.units,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

CREATE TRIGGER auto_deploy_summary_update AFTER UPDATE OF payload ON auto_deploy BEGIN
  INSERT INTO auto_deploy_summary(userId,namespace,stageId,units) VALUES(NEW.userId,NEW.namespace,NEW.stageId,
(
  WITH squad AS (
    SELECT COALESCE(json_extract(value,'$.charId'),
      CASE WHEN instr(json_extract(value,'$.skinId'),'@')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'@')-1)
           WHEN instr(json_extract(value,'$.skinId'),'#')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'#')-1)
           ELSE json_extract(value,'$.skinId') END) charId,
      CASE WHEN json_extract(value,'$.skillIndex') BETWEEN 0 AND 2 THEN json_extract(value,'$.skillIndex') END skill
    FROM json_each(NEW.payload,'$.journal.squad') WHERE type='object'
  ), actions AS (
    SELECT json_extract(value,'$.signiture.charId') charId,
      sum(json_extract(value,'$.op')=0) deployments,sum(json_extract(value,'$.op')=2) activations
    FROM json_each(NEW.payload,'$.journal.logs') WHERE type='object' GROUP BY charId
  ), units AS (SELECT charId FROM squad UNION SELECT charId FROM actions),
  bounded_units AS (SELECT charId FROM units WHERE charId GLOB 'char_*' AND length(charId)<=100 ORDER BY charId LIMIT 64)
  SELECT COALESCE(json_group_array(json_object('charId',u.charId,'skill',s.skill,'squad',CASE WHEN s.charId IS NULL THEN 0 ELSE 1 END,
    'deployed',CASE WHEN a.deployments>0 THEN 1 ELSE 0 END,'deployments',COALESCE(a.deployments,0),'activations',COALESCE(a.activations,0))),'[]')
  FROM bounded_units u LEFT JOIN (SELECT charId,max(skill) skill FROM squad GROUP BY charId) s ON s.charId=u.charId LEFT JOIN actions a ON a.charId=u.charId
  WHERE u.charId GLOB 'char_*'
))
  ON CONFLICT(userId,namespace,stageId) DO UPDATE SET units=excluded.units,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

-- Existing archives are backfilled separately in bounded, resumable batches.
-- See scripts/community/backfill-replay-summaries.py; the original all-row
-- backfill exceeded production D1 CPU limits. Applied Preview schema is unchanged.
