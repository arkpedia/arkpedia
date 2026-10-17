import { CLOCK_ROUTES } from './pageClock';

/** Fixed server-owned routes regenerated after a published pointer reaches the servers.
 * Clock pages cache their large SSR payloads for five minutes (revalidation.ts); the
 * existing live-feed pages have longer explicit intervals. Refresh them on publication
 * so a new content release does not wait for those cache intervals. */
export const RELEASE_REFRESH_ROUTES: readonly string[] = CLOCK_ROUTES;
