const HEADER = 'x-arkpedia-statistics-refresh';
const COHORTS = ['all', 'en', 'jp', 'kr'];
const message = (server, time) => new TextEncoder().encode(`community-statistics-daily:v1:${server}:${new Date(time).toISOString().slice(0, 10)}`);
const key = secret => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function statisticsRefreshToken(secret, server, time = Date.now()) {
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), message(server, time)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyStatisticsRefreshToken(secret, server, token, time = Date.now()) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !(COHORTS.includes(server) || server === 'music')) return false;
  const bytes = Uint8Array.from(token.match(/../g), byte => parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', await key(secret), bytes, message(server, time));
}

/** Bounded daily snapshots through this Worker's own binding, never a public refresh URL
 * or a separate credential-bearing publisher. Exceptions mark the cron invocation failed. */
export async function refreshDailyStatistics(env) {
  if (env.ARKPEDIA_DEPLOYMENT_ROLE !== 'production' || env.ARKPEDIA_AUTH_URL !== 'https://www.arkpedia.net' || !env.WORKER_SELF_REFERENCE || !env.BETTER_AUTH_SECRET) throw Error('Statistics schedule requires the production self binding.');
  const failed = [];
  for (const server of [...COHORTS, 'music']) {
    try {
      const path = server === 'music' ? '/api/music/likes' : '/api/community/rankings?server=' + server;
      const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(`${env.ARKPEDIA_AUTH_URL}${path}`, {
        headers: { 'Cache-Control': 'no-cache', [HEADER]: await statisticsRefreshToken(env.BETTER_AUTH_SECRET, server) }, signal: AbortSignal.timeout(120_000),
      }));
      // Always drain the child response before proceeding to the next D1 cohort.
      await response.arrayBuffer();
      if (!response.ok) failed.push(`${server} (HTTP ${response.status})`);
    } catch { failed.push(`${server} (request failed)`); }
  }
  if (failed.length) throw Error(`Daily statistics refresh failed for ${failed.join(', ')}.`);
}
