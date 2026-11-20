const HEADER = 'x-arkpedia-statistics-refresh';
const COHORTS = ['all', 'en', 'jp', 'kr'];
export const DAILY_STATISTICS_TARGETS = ['music', ...COHORTS];
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

/** Build one snapshot through this Worker's own binding. */
export async function refreshDailyStatistics(env, server, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (env.ARKPEDIA_DEPLOYMENT_ROLE !== 'production' || env.ARKPEDIA_AUTH_URL !== 'https://www.arkpedia.net' || !env.WORKER_SELF_REFERENCE || !env.BETTER_AUTH_SECRET) throw Error('Statistics schedule requires the production self binding.');
  if (!COHORTS.includes(server) && server !== 'music') throw Error('Unknown statistics refresh target.');
  const path = server === 'music' ? '/api/music/likes' : '/api/community/rankings?server=' + server;
  const fetchSnapshot = async () => {
    const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(`${env.ARKPEDIA_AUTH_URL}${path}`, {
      headers: { 'Cache-Control': 'no-cache', [HEADER]: await statisticsRefreshToken(env.BETTER_AUTH_SECRET, server) },
      signal: AbortSignal.timeout(server === 'music' ? 30_000 : 120_000),
    }));
    await response.arrayBuffer();
    return response;
  };
  let response = await fetchSnapshot();
  // Music has no on-demand rebuild. Let D1's observed ten-second window clear
  // once before treating a temporary failure as a missed day.
  if (server === 'music' && response.status === 503) {
    await wait(15_000);
    response = await fetchSnapshot();
  }
  if (!response.ok) throw Error(`Daily statistics refresh failed for ${server} (HTTP ${response.status}).`);
}
