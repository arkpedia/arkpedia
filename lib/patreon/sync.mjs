// Patreon API v2: https://docs.patreon.com/ . Raw member responses never leave this module.
class PatreonSyncError extends Error {}
const ROOT = 'https://www.patreon.com/api/oauth2/v2/';
const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';
const AGENT = 'Arkpedia - Supporter Sync (+https://www.arkpedia.net)';
const encoder = new TextEncoder();
const keys = ['PATREON_CAMPAIGN_ID', 'PATREON_CLIENT_ID', 'PATREON_CLIENT_SECRET', 'PATREON_CREATOR_ACCESS_TOKEN', 'PATREON_CREATOR_REFRESH_TOKEN'];
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const stores = new WeakMap();
function ensureStore(db) {
  if (!stores.has(db)) {
    const prepared = db.prepare(`CREATE TABLE IF NOT EXISTS patreon_supporter_sync (
      campaign_id TEXT PRIMARY KEY, token_envelope TEXT, seed_fingerprint TEXT,
      snapshot_json TEXT, updated_at INTEGER, lease_id TEXT,
      lease_until INTEGER NOT NULL DEFAULT 0, retry_after INTEGER NOT NULL DEFAULT 0
    )`).run().catch(error => { stores.delete(db); throw error; });
    stores.set(db, prepared);
  }
  return stores.get(db);
}

export function patreonConfigured(env) {
  return env?.ARKPEDIA_DEPLOYMENT_ROLE === 'production' && env.ARKPEDIA_AUTH_URL === 'https://www.arkpedia.net' && keys.every(key => typeof env[key] === 'string' && env[key].trim());
}
async function tokenKey(env) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(env.PATREON_CLIENT_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(`${env.PATREON_CAMPAIGN_ID}:${env.PATREON_CLIENT_ID}`), info: encoder.encode('arkpedia:patreon-token-state:v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealTokens(tokens, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), encoder.encode(JSON.stringify(tokens)));
  return `v1.${encode(iv)}.${encode(encrypted)}`;
}
export async function openTokens(envelope, env) {
  const [version, iv, encrypted, extra] = envelope.split('.');
  if (version !== 'v1' || !iv || !encrypted || extra) throw new PatreonSyncError('Invalid Patreon token state.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await tokenKey(env), decode(encrypted));
  const result = JSON.parse(new TextDecoder().decode(plain));
  if (typeof result.access !== 'string' || !result.access || typeof result.refresh !== 'string' || !result.refresh) throw new PatreonSyncError('Invalid Patreon token state.');
  return result;
}
async function json(response) {
  if (Number(response.headers.get('content-length')) > 2_000_000) throw new PatreonSyncError('Patreon response exceeds its size limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new PatreonSyncError('Empty Patreon response.');
  const chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2_000_000) { await reader.cancel(); throw new PatreonSyncError('Patreon response exceeds its size limit.'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const cleanName = value => typeof value === 'string' ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';

/** Closed public projection: only explicit public identities of active paid members. */
export function supporterSnapshot(tiers, members, users, now) {
  const groups = [...tiers.values()].filter(t => Number.isInteger(t.amount_cents) && t.amount_cents > 0 && cleanName(t.title)).sort((a, b) => b.amount_cents - a.amount_cents || a.id.localeCompare(b.id));
  const names = new Map(groups.map(t => [t.id, new Set()]));
  for (const member of members.values()) {
    if (member.attributes?.patron_status !== 'active_patron') continue;
    if (!cleanName(member.attributes?.full_name)) continue;
    const user = users.get(member.relationships?.user?.data?.id);
    if (!user || !Object.hasOwn(user.attributes ?? {}, 'hide_pledges')) throw new PatreonSyncError('Patreon profile privacy fields are missing.');
    if (user.attributes.hide_pledges !== false) continue;
    // Both resources respect Patreon's membership identity masking. Never reconstruct a hidden name.
    const name = cleanName(member.attributes?.full_name);
    if (!name || !cleanName(user.attributes?.full_name)) continue;
    const entitled = member.relationships?.currently_entitled_tiers?.data;
    if (!Array.isArray(entitled)) throw new PatreonSyncError('Patreon tier relationships are missing.');
    const tier = groups.find(group => entitled.some(row => row.type === 'tier' && row.id === group.id));
    if (tier) names.get(tier.id).add(name);
  }
  return { updatedAt: new Date(now).toISOString(), 'supporter-tier': groups.map(t => ({ id: t.id, name: cleanName(t.title), supporters: [...names.get(t.id)].sort((a, b) => a.localeCompare(b, 'en')) })) };
}

export async function readSupporters(env) {
  if (!patreonConfigured(env)) return null;
  await ensureStore(env.ARKPEDIA_ACCOUNTS_DB);
  const row = await env.ARKPEDIA_ACCOUNTS_DB.prepare('SELECT snapshot_json FROM patreon_supporter_sync WHERE campaign_id = ?').bind(env.PATREON_CAMPAIGN_ID.trim()).first();
  return row?.snapshot_json ? JSON.parse(row.snapshot_json) : null;
}

/** One complete snapshot per UTC day. A private D1 lease serializes token rotation and bootstrap. */
export async function syncPatreon(env, { fetch = globalThis.fetch, now = Date.now(), bootstrapOnly = false } = {}) {
  if (!patreonConfigured(env)) return { configured: false };
  env = { ...env, ...Object.fromEntries(keys.map(key => [key, env[key].trim()])) };
  if (!/^\d{1,24}$/.test(env.PATREON_CAMPAIGN_ID) || !env.ARKPEDIA_ACCOUNTS_DB) throw new PatreonSyncError('Patreon campaign storage is not configured.');
  const db = env.ARKPEDIA_ACCOUNTS_DB, id = env.PATREON_CAMPAIGN_ID;
  await ensureStore(db);
  const deadline = performance.now() + 120_000;
  const boundedFetch = (url, options) => {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new PatreonSyncError('Patreon sync exceeded its time limit.');
    return fetch(url, { ...options, signal: AbortSignal.timeout(Math.min(30_000, remaining)) });
  };
  await db.prepare('INSERT OR IGNORE INTO patreon_supporter_sync(campaign_id) VALUES (?)').bind(id).run();
  const lease = crypto.randomUUID();
  const dayStart = Date.parse(new Date(now).toISOString().slice(0, 10));
  const state = await db.prepare(`UPDATE patreon_supporter_sync SET lease_id = ?, lease_until = ? WHERE campaign_id = ? AND lease_until < ? AND retry_after <= ? AND (updated_at IS NULL OR updated_at < ?) ${bootstrapOnly ? 'AND snapshot_json IS NULL' : ''} RETURNING token_envelope, seed_fingerprint`).bind(lease, now + 10 * 60_000, id, now, now, dayStart).first();
  if (!state) return { configured: true, skipped: true };
  try {
    const fingerprint = await sha(JSON.stringify([env.PATREON_CLIENT_ID, env.PATREON_CLIENT_SECRET, env.PATREON_CREATOR_ACCESS_TOKEN, env.PATREON_CREATOR_REFRESH_TOKEN]));
    let tokens = state.token_envelope && state.seed_fingerprint === fingerprint ? await openTokens(state.token_envelope, env) : { access: env.PATREON_CREATOR_ACCESS_TOKEN, refresh: env.PATREON_CREATOR_REFRESH_TOKEN };
    async function saveTokens() {
      const result = await db.prepare('UPDATE patreon_supporter_sync SET token_envelope = ?, seed_fingerprint = ? WHERE campaign_id = ? AND lease_id = ?').bind(await sealTokens(tokens, env), fingerprint, id, lease).run();
      if (result.meta.changes !== 1) throw new PatreonSyncError('Patreon token state lease expired.');
    }
    await saveTokens();
    let refreshed = false;
    async function request(url) {
      let response = await boundedFetch(url, { headers: { Authorization: `Bearer ${tokens.access}`, 'User-Agent': AGENT, Accept: 'application/json' }, redirect: 'error' });
      if (response.status === 401 && !refreshed) {
        await response.body?.cancel(); refreshed = true;
        const renewal = await boundedFetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENT }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.PATREON_CLIENT_ID, client_secret: env.PATREON_CLIENT_SECRET, refresh_token: tokens.refresh }), redirect: 'error' });
        if (!renewal.ok) { await renewal.body?.cancel(); throw new PatreonSyncError(`Patreon token refresh failed (HTTP ${renewal.status}).`); }
        const next = await json(renewal);
        if (typeof next.access_token !== 'string' || !next.access_token || typeof next.refresh_token !== 'string' || !next.refresh_token) throw new PatreonSyncError('Patreon returned an incomplete token pair.');
        tokens = { access: next.access_token, refresh: next.refresh_token };
        // Persist rotation before another request; a later membership failure must not lose it.
        await saveTokens();
        response = await boundedFetch(url, { headers: { Authorization: `Bearer ${tokens.access}`, 'User-Agent': AGENT, Accept: 'application/json' }, redirect: 'error' });
      }
      if (!response.ok) { await response.body?.cancel(); throw new PatreonSyncError(`Patreon API request failed (HTTP ${response.status}).`); }
      return json(response);
    }
    const campaignUrl = new URL(`campaigns/${id}`, ROOT); campaignUrl.search = new URLSearchParams({ include: 'tiers', 'fields[tier]': 'title,amount_cents' });
    const campaign = await request(campaignUrl);
    if (campaign.data?.type !== 'campaign' || campaign.data?.id !== id || !Array.isArray(campaign.included)) throw new PatreonSyncError('Patreon campaign response is incomplete.');
    const tiers = new Map(campaign.included.filter(row => row.type === 'tier').map(row => [row.id, { id: row.id, ...row.attributes }]));
    const members = new Map(), users = new Map(), cursors = new Set();
    let total;
    const memberUrl = new URL(`campaigns/${id}/members`, ROOT);
    memberUrl.search = new URLSearchParams({ include: 'currently_entitled_tiers,user', 'fields[member]': 'full_name,patron_status', 'fields[user]': 'full_name,hide_pledges', 'fields[tier]': 'title,amount_cents', 'page[count]': '100' });
    for (let page = 0; ; page++) {
      if (page >= 100) throw new PatreonSyncError('Patreon pagination exceeds its limit.');
      const result = await request(memberUrl);
      if (!Array.isArray(result.data) || !Array.isArray(result.included ?? [])) throw new PatreonSyncError('Patreon membership response is incomplete.');
      if (Number.isInteger(result.meta?.pagination?.total)) total = result.meta.pagination.total;
      for (const member of result.data) { if (member.type !== 'member' || typeof member.id !== 'string' || members.has(member.id)) throw new PatreonSyncError('Invalid Patreon membership.'); members.set(member.id, member); }
      for (const resource of result.included ?? []) {
        if (resource.type === 'user') users.set(resource.id, resource);
        if (resource.type === 'tier') tiers.set(resource.id, { id: resource.id, ...resource.attributes });
      }
      const cursor = result.meta?.pagination?.cursors?.next;
      if (cursor == null) break;
      if (typeof cursor !== 'string' || !cursor || cursor.length > 2048 || cursors.has(cursor)) throw new PatreonSyncError('Invalid Patreon pagination cursor.');
      cursors.add(cursor); memberUrl.searchParams.set('page[cursor]', cursor);
    }
    if (total !== undefined && total !== members.size) throw new PatreonSyncError('Patreon pagination did not return the complete membership list.');
    for (const tier of tiers.values()) if (typeof tier.id !== 'string' || !/^\d{1,24}$/.test(tier.id) || !cleanName(tier.title) || !Number.isInteger(tier.amount_cents) || tier.amount_cents < 0) throw new PatreonSyncError('Patreon tier details are incomplete.');
    const snapshot = supporterSnapshot(tiers, members, users, now);
    const encoded = JSON.stringify(snapshot);
    if (encoded.length > 500_000) throw new PatreonSyncError('Patreon public snapshot exceeds its limit.');
    const result = await db.prepare('UPDATE patreon_supporter_sync SET snapshot_json = ?, updated_at = ?, retry_after = 0 WHERE campaign_id = ? AND lease_id = ?').bind(encoded, now, id, lease).run();
    if (result.meta.changes !== 1) throw new PatreonSyncError('Patreon snapshot lease expired.');
    return { configured: true, updated: true };
  } catch (error) {
    await db.prepare('UPDATE patreon_supporter_sync SET retry_after = ? WHERE campaign_id = ? AND lease_id = ?').bind(now + 3600_000, id, lease).run();
    throw error instanceof PatreonSyncError ? error : new PatreonSyncError('Patreon synchronization failed; the previous snapshot was retained.');
  } finally {
    await db.prepare('UPDATE patreon_supporter_sync SET lease_id = NULL, lease_until = 0 WHERE campaign_id = ? AND lease_id = ?').bind(id, lease).run();
  }
}
