"""SELECT-only export of approved anonymous totals for isolated Preview QA.

Parse archives in small, disjoint public-stage batches: production deliberately
has no Preview replay-summary migration. No identities or payloads leave D1.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import tomllib

ACCOUNT = '1ff51c10571eaa9934bc451e1bfdb361'
DATABASE = 'f7daff77-8e8f-4ec2-998b-97fb6e4b948f'
MIN_SAMPLE = 10
catalogue = json.loads(Path('data/community-operator-catalogue.json').read_text())
stage_catalogue = {row['id']: row for row in json.loads(Path('data/community-stage-catalogue.json').read_text())}
char_names = {char: row['name'] for row in catalogue for char in row['charIds']}
names = {row['name'] for row in catalogue}
config = Path.home() / 'Library/Preferences/.wrangler/config/default.toml'
credential = os.environ.get('CLOUDFLARE_API_TOKEN') or tomllib.loads(config.read_text())['oauth_token']
replay_cache = {}


def query(sql, params):
    settings = 'url = ' + json.dumps(f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DATABASE}/query') + '\n'
    settings += 'header = ' + json.dumps('Authorization: Bearer ' + credential) + '\nheader = "Content-Type: application/json"\ndata = ' + json.dumps(json.dumps({'sql': sql, 'params': params})) + '\n'
    response = subprocess.run(['/usr/bin/curl', '--silent', '--show-error', '--max-time', '60', '--config', '-'], input=settings, text=True, capture_output=True, check=True)
    data = json.loads(response.stdout)
    if not data.get('success'):
        raise RuntimeError('Cloudflare aggregate query failed: ' + ','.join(str(e.get('code')) + ': ' + str(e.get('message')) for e in data.get('errors', [])))
    return data['result'][0]['results']


def cohort(server):
    region = '' if server == 'all' else ' AND substr(d.namespace,1,2)=?'
    roster_region = '' if server == 'all' else ' AND a.server=?'
    args = [] if server == 'all' else [server]
    # This query reads only compact counters and roster projections, never payloads.
    sql = f"""WITH eligible AS (
      SELECT d.userId,d.namespace,d.stageId,d.fingerprint,
        row_number() OVER(PARTITION BY d.namespace,d.stageId ORDER BY d.userId) pick
      FROM auto_deploy d JOIN community_account a ON a.userId=d.userId
      WHERE a.stats=1 AND d.stageId IN (SELECT value FROM json_each(?)){region}
    ), runs AS (SELECT * FROM eligible WHERE pick=1), counters AS (
      SELECT namespace,stageId,max(CASE WHEN json_valid(fingerprint) THEN CASE
        WHEN typeof(json_extract(fingerprint,'$[2]'))='integer' AND json_extract(fingerprint,'$[2]')>=0 THEN json_extract(fingerprint,'$[2]') END END) clears
      FROM eligible GROUP BY namespace,stageId
    ), successful AS (
      SELECT stageId FROM runs WHERE CASE WHEN json_valid(fingerprint) THEN
        ((typeof(json_extract(fingerprint,'$[2]'))='integer' AND json_extract(fingerprint,'$[2]')>0) OR (typeof(json_extract(fingerprint,'$[4]'))='integer' AND json_extract(fingerprint,'$[4]')>=2)) ELSE 0 END
    ) SELECT
      (SELECT count(*) FROM community_account a WHERE a.stats=1{roster_region}) contributors,
      (SELECT json_object('contributors',count(DISTINCT namespace),'replays',count(*),
        'region',CASE WHEN count(DISTINCT substr(namespace,1,2))=1 THEN min(substr(namespace,1,2)) ELSE 'all' END) FROM runs) coverage,
      (SELECT json_object('contributors',count(DISTINCT CASE WHEN clears IS NOT NULL THEN namespace END),'records',count(clears)) FROM counters) clearSample,
      (SELECT count(DISTINCT stageId) FROM successful) clearedStages,
      (SELECT json_group_array(json_object('stageId',stageId,'clears',clears)) FROM
        (SELECT stageId,sum(clears) clears FROM counters WHERE clears IS NOT NULL GROUP BY stageId)) stageClears,
      (SELECT json_group_array(DISTINCT stageId) FROM runs) stages,
      (SELECT json_group_array(json_object('operator',operator,'owned',owned,'builds',builds,'e2',e2,'m9',m9,'m3',json_array(m3_0,m3_1,m3_2),'unraised',unraised,'maxed',maxed)) FROM (
        SELECT o.operator,count(*) owned,count(CASE WHEN o.elite IS NOT NULL AND o.level IS NOT NULL THEN 1 END) builds,
          sum(CASE WHEN o.elite=2 THEN 1 ELSE 0 END) e2,
          sum(CASE WHEN o.elite=2 AND o.m0=3 AND o.m1=3 AND o.m2=3 THEN 1 ELSE 0 END) m9,
          sum(CASE WHEN o.elite=2 AND o.m0=3 THEN 1 ELSE 0 END) m3_0,
          sum(CASE WHEN o.elite=2 AND o.m1=3 THEN 1 ELSE 0 END) m3_1,
          sum(CASE WHEN o.elite=2 AND o.m2=3 THEN 1 ELSE 0 END) m3_2,
          sum(CASE WHEN o.elite=0 AND o.level=1 THEN 1 ELSE 0 END) unraised,
          sum(CASE WHEN o.elite=2 AND o.level=90 THEN 1 ELSE 0 END) maxed
        FROM community_operator o JOIN community_account a ON a.userId=o.userId
        WHERE a.stats=1{roster_region} AND o.operator IN (SELECT value FROM json_each(?)) GROUP BY o.operator
      )) roster"""
    row = query(sql, [json.dumps(list(stage_catalogue)), *args, *args, *args, json.dumps(sorted(names))])[0]
    coverage = json.loads(row['coverage'])
    clears = json.loads(row['clearSample'])
    result = {'contributors': row['contributors'], 'roster': json.loads(row['roster']) if row['contributors'] >= MIN_SAMPLE else None,
              'replayContributors': coverage['contributors'], 'replays': coverage['replays'],
              'clearContributors': clears['contributors'], 'clearRecords': clears['records'], 'clearedStages': row['clearedStages'],
              'stageClears': [{**r, **{k: stage_catalogue[r['stageId']][k] for k in ['slug', 'code', 'name', 'image']}} for r in json.loads(row['stageClears'])] if clears['contributors'] >= MIN_SAMPLE else None,
              'battles': None, 'stageCoverage': None}
    if coverage['contributors'] >= MIN_SAMPLE:
        cache_key = coverage['region']
        if cache_key not in replay_cache:
            battles, stages = {}, {}
            active = sorted(json.loads(row['stages']))
            for offset in range(0, len(active), 20):
                batch = active[offset:offset + 20]
                batch_sql = f"""WITH eligible AS (
                  SELECT d.namespace,d.stageId,d.payload,d.fingerprint,row_number() OVER(PARTITION BY d.namespace,d.stageId ORDER BY d.userId) pick
                  FROM auto_deploy d JOIN community_account a ON a.userId=d.userId
                  WHERE a.stats=1 AND d.stageId IN (SELECT value FROM json_each(?)){region}
                ), runs AS MATERIALIZED (SELECT * FROM eligible WHERE pick=1), squad AS (
                  SELECT r.namespace,r.stageId,COALESCE(json_extract(s.value,'$.charId'),CASE
                    WHEN instr(json_extract(s.value,'$.skinId'),'@')>0 THEN substr(json_extract(s.value,'$.skinId'),1,instr(json_extract(s.value,'$.skinId'),'@')-1)
                    WHEN instr(json_extract(s.value,'$.skinId'),'#')>0 THEN substr(json_extract(s.value,'$.skinId'),1,instr(json_extract(s.value,'$.skinId'),'#')-1)
                    ELSE json_extract(s.value,'$.skinId') END) charId,
                    max(CASE WHEN json_extract(s.value,'$.skillIndex') BETWEEN 0 AND 2 THEN json_extract(s.value,'$.skillIndex') END) skill
                  FROM runs r,json_each(r.payload,'$.journal.squad') s WHERE s.type='object' GROUP BY r.namespace,r.stageId,charId
                ), actions AS (
                  SELECT r.namespace,r.stageId,json_extract(l.value,'$.signiture.charId') charId,
                    sum(json_extract(l.value,'$.op')=0) deployments,sum(json_extract(l.value,'$.op')=2) activations
                  FROM runs r,json_each(r.payload,'$.journal.logs') l WHERE l.type='object' GROUP BY r.namespace,r.stageId,charId
                ), keys0 AS (SELECT namespace,stageId,charId FROM squad UNION SELECT namespace,stageId,charId FROM actions),
                keys AS (SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY namespace,stageId ORDER BY charId) ordinal FROM keys0 WHERE charId IN (SELECT key FROM json_each(?))) WHERE ordinal<=64),
                units AS MATERIALIZED (
                  SELECT k.namespace,k.stageId,k.charId,s.skill,CASE WHEN s.charId IS NULL THEN 0 ELSE 1 END inSquad,
                    COALESCE(a.deployments,0) deployments,COALESCE(a.activations,0) activations
                  FROM keys k LEFT JOIN squad s ON s.namespace=k.namespace AND s.stageId=k.stageId AND s.charId=k.charId
                  LEFT JOIN actions a ON a.namespace=k.namespace AND a.stageId=k.stageId AND a.charId=k.charId
                )
                SELECT 'battles' kind,json_group_array(json_object('charId',charId,'skill',skill,'squads',squads,'deployed',deployed,'deployments',deployments,'activations',activations,'benched',benched)) payload FROM (
                  SELECT charId,skill,sum(inSquad) squads,sum(deployments>0) deployed,sum(deployments) deployments,sum(activations) activations,
                    sum(CASE WHEN inSquad=1 AND deployments=0 THEN 1 ELSE 0 END) benched FROM units GROUP BY charId,skill
                ) UNION ALL SELECT 'stages',json_group_array(json_object('operator',operator,'stages',stages)) FROM (
                  SELECT p.value operator,count(DISTINCT u.stageId) stages FROM units u JOIN json_each(?) p ON p.key=u.charId
                  JOIN runs r ON r.namespace=u.namespace AND r.stageId=u.stageId WHERE u.deployments>0 AND CASE WHEN json_valid(r.fingerprint) THEN
                    ((typeof(json_extract(r.fingerprint,'$[2]'))='integer' AND json_extract(r.fingerprint,'$[2]')>0) OR (typeof(json_extract(r.fingerprint,'$[4]'))='integer' AND json_extract(r.fingerprint,'$[4]')>=2)) ELSE 0 END GROUP BY p.value
                )"""
                part = {r['kind']: json.loads(r['payload']) for r in query(batch_sql, [json.dumps(batch), *args, json.dumps(char_names), json.dumps(char_names)])}
                for unit in part['battles']:
                    key = (unit['charId'], unit['skill'])
                    if key not in battles:
                        battles[key] = unit
                    else:
                        for field in ['squads', 'deployed', 'deployments', 'activations', 'benched']:
                            battles[key][field] += unit[field]
                for op in part['stages']:
                    stages[op['operator']] = stages.get(op['operator'], 0) + op['stages']
            replay_cache[cache_key] = (list(battles.values()), [{'operator': op, 'stages': count} for op, count in sorted(stages.items())])
        result['battles'], result['stageCoverage'] = replay_cache[cache_key]
    assert all(r['operator'] in names for r in result['roster'] or [])
    assert all(r['charId'] in char_names for r in result['battles'] or [])
    assert all(r['stageId'] in stage_catalogue for r in result['stageClears'] or [])
    assert all(r['operator'] in names for r in result['stageCoverage'] or [])
    return result


cohorts = {server: cohort(server) for server in ['all', 'en', 'jp', 'kr']}
snapshot = {'schema': 1, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'cohorts': cohorts}
output = Path('config/preview-community-statistics.json')
output.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
print('Saved anonymous aggregate snapshot:', output)
for server, values in cohorts.items():
    print(server, {key: values[key] for key in ['contributors', 'replayContributors', 'replays']})
