-- Missing summaries only; rerunning preserves summaries created by the live triggers.
INSERT INTO auto_deploy_summary(userId,namespace,stageId,units)
SELECT r.userId,r.namespace,r.stageId,
(
  WITH squad AS (
    SELECT COALESCE(json_extract(value,'$.charId'),
      CASE WHEN instr(json_extract(value,'$.skinId'),'@')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'@')-1)
           WHEN instr(json_extract(value,'$.skinId'),'#')>0 THEN substr(json_extract(value,'$.skinId'),1,instr(json_extract(value,'$.skinId'),'#')-1)
           ELSE json_extract(value,'$.skinId') END) charId,
      CASE WHEN json_extract(value,'$.skillIndex') BETWEEN 0 AND 2 THEN json_extract(value,'$.skillIndex') END skill
    FROM json_each(r.payload,'$.journal.squad') WHERE type='object'
  ), actions AS (
    SELECT json_extract(value,'$.signiture.charId') charId,
      sum(json_extract(value,'$.op')=0) deployments,sum(json_extract(value,'$.op')=2) activations
    FROM json_each(r.payload,'$.journal.logs') WHERE type='object' GROUP BY charId
  ), units AS (SELECT charId FROM squad UNION SELECT charId FROM actions),
  bounded_units AS (SELECT charId FROM units WHERE charId GLOB 'char_*' AND length(charId)<=100 ORDER BY charId LIMIT 64)
  SELECT COALESCE(json_group_array(json_object('charId',u.charId,'skill',s.skill,'squad',CASE WHEN s.charId IS NULL THEN 0 ELSE 1 END,
    'deployed',CASE WHEN a.deployments>0 THEN 1 ELSE 0 END,'deployments',COALESCE(a.deployments,0),'activations',COALESCE(a.activations,0))),'[]')
  FROM bounded_units u LEFT JOIN (SELECT charId,max(skill) skill FROM squad GROUP BY charId) s ON s.charId=u.charId LEFT JOIN actions a ON a.charId=u.charId
  WHERE u.charId GLOB 'char_*'
)
FROM auto_deploy r
WHERE NOT EXISTS (SELECT 1 FROM auto_deploy_summary s WHERE s.userId=r.userId AND s.namespace=r.namespace AND s.stageId=r.stageId)
ORDER BY r.rowid LIMIT 250;
