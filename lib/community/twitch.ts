export interface TwitchStream {
  userLogin: string;
  displayName: string;
  title: string;
  gameName: string;
  viewerCount: number;
  thumbnailUrl: string;
  startedAt: string;
  url: string;
}

// In-memory cache for the app access token within a single server
// instance -- avoids requesting a new token on every live-feed refresh.
// Tokens are valid for ~60 days, so a simple module-level
// cache is more than enough here.
let cachedToken: { token: string; expiresAt: number } | null = null;

// Category IDs change rarely; cache this metadata separately from live results.
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedCategory: { name: string; id: string; expiresAt: number } | null = null;

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh a minute early
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export async function getLiveTwitchStreams(
  categoryName: string,
  limit: number,
  clientId: string | undefined,
  clientSecret: string | undefined
): Promise<TwitchStream[]> {
  if (!clientId || !clientSecret || !categoryName) return [];

  const token = await getAppAccessToken(clientId, clientSecret);
  if (!token) return [];

  const headers = {
    'Client-Id': clientId,
    Authorization: `Bearer ${token}`,
  };

  // Resolve the category/game name only when its cached metadata has expired.
  let gameId = cachedCategory?.name === categoryName && cachedCategory.expiresAt > Date.now()
    ? cachedCategory.id : null;
  if (!gameId) {
    try {
      const gameRes = await fetch(
        `https://api.twitch.tv/helix/games?name=${encodeURIComponent(categoryName)}`,
        { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }
      );
      if (!gameRes.ok) {
        if (gameRes.status === 401) cachedToken = null;
        return [];
      }
      const gameData = await gameRes.json();
      gameId = gameData.data?.[0]?.id || null;
      if (gameId) cachedCategory = { name: categoryName, id: gameId, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS };
    } catch {
      return [];
    }
  }
  if (!gameId) return [];

  const streams: TwitchStream[] = [];
  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=${Math.min(limit, 100)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      if (res.status === 401) cachedToken = null;
      return [];
    }
    const data = await res.json();
    for (const item of data.data || []) {
      // Never label a different category or a non-live entry as an Arknights stream.
      if (item.type !== 'live' || item.game_id !== gameId) continue;
      streams.push({
        userLogin: item.user_login,
        displayName: item.user_name,
        title: item.title,
        gameName: item.game_name,
        viewerCount: item.viewer_count,
        thumbnailUrl: (item.thumbnail_url as string).replace('{width}', '440').replace('{height}', '248'),
        startedAt: item.started_at,
        url: `https://www.twitch.tv/${item.user_login}`,
      });
    }
  } catch {
    /* return whatever we have, likely empty */
  }

  return streams;
}
