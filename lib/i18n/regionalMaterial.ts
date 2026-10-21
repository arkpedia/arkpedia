/**
 * Whether JP and KR mode show those servers' own material: their in-game boards' event and banner
 * art (lib/time/regional.ts regionalArt), their board notices in an event's News tab
 * (components/events/EventExtras.tsx) and only their own web events on /community.
 *
 * Off (owner, 2026-10-21): the server switch moves timings only, and every server shows Global's
 * art, news and web events, in English. That material is in Japanese and Korean, so it waits for
 * the site to have those languages; the language a reader picks will decide it then, not the
 * server. The content run keeps collecting it (sync-official-bulletins, sync-regional-schedules),
 * so turning this on needs no data work.
 */
export const REGIONAL_MATERIAL = false;
