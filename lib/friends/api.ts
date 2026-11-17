import type { NextApiRequest, NextApiResponse } from 'next';
import type { D1Database } from '@cloudflare/workers-types';
import { isServerId } from '@/lib/account-import/yostar';
import { assertNoCredentials } from '@/lib/cloud-account/data';
import { AVAILABILITY_MAX_AGE, FULL_REPORT_THRESHOLD, SUPPORT_MAX_AGE, type SupportPlayer } from '@/lib/community/model';
import { isFriendLinkId, publicFriendFile, type ProfileSharingState } from './sharedProfile';

interface ProfileRow { revision: number; enabled: number; gameKey: string | null; snapshot: string | null }
interface AccountRow { revision: number; gameKey: string | null; listingId: string; server: string; importedAt: string; stats: number; shareTag: number; openRequests: number; friendTag: string | null }
type PlayerRow = Omit<SupportPlayer, 'supports' | 'appearance'> & { appearance: string | null; supports: string; userId: string; gameKey: string | null; snapshot: string | null; enabled: number; profileGameKey: string | null; profileUpdatedAt: string | null };
const reportQuery = `SELECT targetId,snapshotAt,sum(isFull) AS fullReports,sum(1-isFull) AS openReports FROM community_availability WHERE createdAt>=? GROUP BY targetId,snapshotAt`;
const playerFields = `a.listingId AS id,a.friendTag,a.server,a.slots,a.importedAt,a.appearance,
  COALESCE(r.fullReports,0) AS fullReports,COALESCE(r.openReports,0) AS openReports,
  (SELECT json_group_array(json(build)) FROM (SELECT json_object('operator',operator,'elite',elite,'level',level,'skill',skill,'mastery',mastery,'module',module,'moduleLevel',moduleLevel,'potential',potential,'skin',skin,'skillId',skillId,'allMastered',allMastered,'skillLevel',skillLevel,'skillMasteries',json(COALESCE(skillMasteries,'[]'))) AS build FROM community_support WHERE userId=a.userId ORDER BY slot)) AS supports`;
const publicPlayer = (row: PlayerRow): SupportPlayer => ({
  id: row.id, friendTag: row.friendTag, server: row.server, slots: row.slots,
  importedAt: row.importedAt, appearance: row.appearance ? JSON.parse(row.appearance) : null,
  fullReports: row.fullReports, openReports: row.openReports,
  supports: JSON.parse(row.supports).map((unit: Record<string, unknown>) => ({ ...unit, allMastered: unit.allMastered === null ? null : !!unit.allMastered })),
});
const fullProfile = (row: PlayerRow) => !!(row.enabled && row.gameKey && row.gameKey === row.profileGameKey);
const summary = (row: PlayerRow) => ({player: publicPlayer(row), collectionShared: fullProfile(row), profileUpdatedAt: fullProfile(row) ? row.profileUpdatedAt : null});
const accountRow = (db: D1Database, owner: string) => db.prepare('SELECT revision,gameKey,listingId,server,importedAt,stats,shareTag,openRequests,friendTag FROM community_account WHERE userId=?').bind(owner).first<AccountRow>();
const profileRow = (db: D1Database, owner: string) => db.prepare('SELECT revision,enabled,gameKey,snapshot FROM community_friend_profile WHERE userId=?').bind(owner).first<ProfileRow>();
function ownerState(account: AccountRow | null, profile: ProfileRow | null, owner: string): ProfileSharingState {
  const enabled = !!(profile?.enabled && account?.shareTag && account.openRequests && account.gameKey === profile.gameKey);
  return { owner, revision: profile?.revision ?? 0, enabled, communityRevision: account?.revision ?? 0,
    id: account?.listingId ?? null, server: account?.server ?? null,
    importedAt: enabled && profile?.snapshot ? publicFriendFile(JSON.parse(profile.snapshot)).account.importedAt : null,
    accountImportedAt: account?.importedAt ?? null, choices: {stats:!!account?.stats,shareTag:!!account?.shareTag,openRequests:!!account?.openRequests} };
}

/** Full rosters are published separately from support sharing and anonymous statistics. */
export async function friendProfiles(req: NextApiRequest, res: NextApiResponse, db: D1Database, owner: string | null, now: number) {
  if (req.method === 'GET' && req.query.mine !== '1') {
    const reportsSince = new Date(now - AVAILABILITY_MAX_AGE).toISOString();
    const joins = `FROM community_account a LEFT JOIN reports r ON r.targetId=a.userId AND r.snapshotAt=a.importedAt LEFT JOIN community_friend_profile p ON p.userId=a.userId`;
    if (req.query.ids !== undefined) {
      if (typeof req.query.ids !== 'string' || req.query.ids.length > 1900) return res.status(400).json({error:'Invalid saved friend links.'});
      const ids = [...new Set(req.query.ids.split(','))];
      if (!ids.length || ids.length > 50 || !ids.every(isFriendLinkId)) return res.status(400).json({error:'Invalid saved friend links.'});
      const rows = (await db.prepare(`WITH reports AS (${reportQuery}) SELECT ${playerFields},a.gameKey,p.enabled,p.gameKey AS profileGameKey,p.updatedAt AS profileUpdatedAt ${joins}
        WHERE a.listingId IN (${ids.map(()=>'?').join(',')}) AND a.shareTag=1 AND a.openRequests=1 AND a.friendTag IS NOT NULL
        AND ((p.enabled=1 AND p.gameKey=a.gameKey) OR a.importedAt>=?)`).bind(reportsSince,...ids,new Date(now-SUPPORT_MAX_AGE).toISOString()).all<PlayerRow>()).results;
      return res.json({profiles: rows.map(summary)});
    }
    if (req.query.id !== undefined) {
      if (!isFriendLinkId(req.query.id)) return res.status(400).json({ error: 'Invalid profile link.' });
      const row = await db.prepare(`WITH reports AS (${reportQuery}) SELECT ${playerFields},a.userId,a.gameKey,p.snapshot,p.enabled,p.gameKey AS profileGameKey,p.updatedAt AS profileUpdatedAt ${joins}
        WHERE a.listingId=? AND a.shareTag=1 AND a.openRequests=1 AND a.friendTag IS NOT NULL`).bind(reportsSince, req.query.id).first<PlayerRow>();
      if (!row) return res.status(404).json({ error: 'This player is no longer sharing this profile.' });
      const full = fullProfile(row);
      if (!full && Date.parse(row.importedAt) < now - SUPPORT_MAX_AGE) return res.status(404).json({ error: 'This shared snapshot has expired.' });
      return res.json({ ...summary(row), profile: full ? publicFriendFile(JSON.parse(row.snapshot!)) : null });
    }
    const { server = 'en', tag = '', operator = '', cursor = '0' } = req.query;
    if (!isServerId(server) || typeof tag !== 'string' || tag.length > 200 || typeof operator !== 'string' || operator.length > 200 || typeof cursor !== 'string' || !/^\d{1,5}$/.test(cursor) || +cursor > 10000) return res.status(400).json({ error: 'Invalid friend search filters.' });
    const conditions = ['a.server=?','a.shareTag=1','a.openRequests=1','a.friendTag IS NOT NULL','a.slots>0','a.importedAt>=?',`(COALESCE(r.fullReports,0)<${FULL_REPORT_THRESHOLD} OR COALESCE(r.openReports,0)>=COALESCE(r.fullReports,0))`];
    const args: (string | number)[] = [server, new Date(now - SUPPORT_MAX_AGE).toISOString()];
    if (tag.trim()) { conditions.push('instr(lower(a.friendTag),lower(?))>0'); args.push(tag.trim()); }
    if (operator) {
      conditions.push(`(EXISTS(SELECT 1 FROM community_support s WHERE s.userId=a.userId AND s.operator=?) OR (p.enabled=1 AND p.gameKey=a.gameKey AND EXISTS(SELECT 1 FROM community_friend_operator o WHERE o.userId=a.userId AND o.operator=?)))`);
      args.push(operator, operator);
    }
    const rows = (await db.prepare(`WITH reports AS (${reportQuery}) SELECT ${playerFields},a.gameKey,p.enabled,p.gameKey AS profileGameKey ${joins} WHERE ${conditions.join(' AND ')} ORDER BY a.importedAt DESC,a.listingId LIMIT 51 OFFSET ?`).bind(reportsSince, ...args, +cursor).all<PlayerRow>()).results;
    return res.json({ listings: rows.slice(0,50).map(row=>({...publicPlayer(row),collectionShared:fullProfile(row)})), next: rows.length > 50 && +cursor + 50 <= 10000 ? +cursor + 50 : null });
  }
  if (!owner) return res.status(401).json({ error: 'Sign in to publish your profile.' });
  const [account, profile] = await Promise.all([accountRow(db, owner), profileRow(db, owner)]);
  if (req.method === 'GET') return res.json(ownerState(account, profile, owner));
  if (req.body?.owner !== owner) return res.status(409).json({ error: 'Your signed-in account changed. Reopen profile sharing.' });
  if (!Number.isSafeInteger(req.body.revision) || req.body.revision !== (profile?.revision ?? 0)) return res.status(409).json({ error: 'Profile sharing changed on another device. Review it again.' });
  if (!await db.prepare(`INSERT INTO community_write_limit(userId,window,count) VALUES(?,?,1) ON CONFLICT(userId) DO UPDATE SET window=excluded.window,count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END WHERE window!=excluded.window OR count<10 RETURNING count`).bind(owner,Math.floor(now/60000)).first()) {
    res.setHeader('Retry-After','60'); return res.status(429).json({ error: 'Please wait a minute before updating profile sharing.' });
  }
  const nonce = crypto.randomUUID(), time = new Date(now).toISOString();
  if (req.method === 'DELETE') {
    if (!profile) return res.json(ownerState(account, null, owner));
    const result = await db.batch([
      db.prepare('UPDATE community_friend_profile SET enabled=0,gameKey=NULL,snapshot=NULL,revision=revision+1,mutationId=?,updatedAt=? WHERE userId=? AND revision=? RETURNING userId').bind(nonce,time,owner,profile.revision),
      db.prepare('DELETE FROM community_friend_operator WHERE userId=? AND EXISTS(SELECT 1 FROM community_friend_profile WHERE userId=? AND mutationId=?)').bind(owner,owner,nonce),
    ]);
    if (result[0].results.length !== 1) return res.status(409).json({ error: 'Profile sharing changed. Review it again.' });
    return res.json(ownerState(await accountRow(db,owner),await profileRow(db,owner),owner));
  }
  if (!account?.gameKey || !account.shareTag || !account.openRequests || !account.friendTag || req.body.communityRevision !== account.revision) return res.status(409).json({ error: 'Review Share my friend tag and support units before publishing.' });
  if (!['consent','refresh'].includes(req.body.action) || (req.body.action === 'refresh' && (!profile?.enabled || profile.gameKey !== account.gameKey))) return res.status(409).json({ error: 'Explicit full-profile consent is required.' });
  assertNoCredentials(req.body.profile);
  let shared;
  try { shared = publicFriendFile(req.body.profile); } catch { return res.status(400).json({ error: 'Invalid public profile.' }); }
  if (shared.account.server !== account.server || shared.account.importedAt !== account.importedAt) return res.status(409).json({ error: 'The imported game account changed. Review sharing again.' });
  shared.account.doctor = account.friendTag;
  const guard = 'EXISTS(SELECT 1 FROM community_account WHERE userId=? AND revision=? AND gameKey=? AND shareTag=1 AND openRequests=1)';
  const statement = profile
    ? db.prepare(`UPDATE community_friend_profile SET enabled=1,gameKey=?,snapshot=?,revision=revision+1,mutationId=?,updatedAt=? WHERE userId=? AND revision=? AND ${guard} RETURNING userId`).bind(account.gameKey,JSON.stringify(shared),nonce,time,owner,profile.revision,owner,account.revision,account.gameKey)
    : db.prepare(`INSERT INTO community_friend_profile(userId,revision,enabled,gameKey,snapshot,mutationId,updatedAt) SELECT ?,1,1,?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM community_friend_profile WHERE userId=?) RETURNING userId`).bind(owner,account.gameKey,JSON.stringify(shared),nonce,time,owner,account.revision,account.gameKey,owner);
  const mutationGuard = 'EXISTS(SELECT 1 FROM community_friend_profile WHERE userId=? AND mutationId=?)';
  const result = await db.batch([statement,
    db.prepare(`DELETE FROM community_friend_operator WHERE userId=? AND ${mutationGuard}`).bind(owner,owner,nonce),
    db.prepare(`INSERT INTO community_friend_operator(userId,operator) SELECT ?,value FROM json_each(?) WHERE ${mutationGuard}`).bind(owner,JSON.stringify(shared.account.operators),owner,nonce),
  ]);
  if (result[0].results.length !== 1) return res.status(409).json({ error: 'Profile sharing changed. Review it again.' });
  return res.json(ownerState(await accountRow(db,owner),await profileRow(db,owner),owner));
}
