/**
 * The pages a content release refreshes as soon as it goes live (pages/api/release-refresh.ts,
 * called by prepare-content.yml's "Refresh the pages that wait longest for a release").
 *
 * Every content page regenerates on the first visit after its revalidate interval. Most wait
 * 60 seconds, so a release reaches them within a minute of a visit anyway; these wait longer,
 * for the live feeds they fetch (YouTube, Twitch) or because they change rarely, and so showed
 * the previous release for up to 25 minutes or an hour after one went live. On 2026-09-30 the
 * home page kept an ended event's old state and four of seven skins on sale for 25 minutes
 * after the release that fixed them. A fixed list, not an input: whoever holds the secret can
 * only ask for these few regenerations. test-release-refresh.ts holds it to every content page
 * whose revalidate is longer than a minute.
 */
export const RELEASE_REFRESH_ROUTES = ['/', '/community', '/games/music-guesser'] as const;
