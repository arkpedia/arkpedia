/**
 * Whether a banner waits for Global's own information: a Joint Operation or an Orienteering that
 * Global's client does not carry (no globalPoolId) and no official announcement has timed (no
 * global_window.timingSource) -- undated, or dated only by a forecast on a record the catalogue
 * linked to its CN pool. Global will not have the same operators (the site owner,
 * 2026-10-06: "anything CN for Joint Operation and Orienteering should not be shown"), so nothing
 * of it is shown until Global has it: the banner list every page reads leaves it out
 * (lib/gacha/headhuntingBannerData.ts, and /schedule's table), no Global window is predicted for
 * it (lib/gacha/bannerSchedule.ts), and the completeness check holds nothing for it
 * (scripts/content/check-completeness.mjs). One copy, for the site and the scripts.
 *
 * A Global date alone is not enough: Orienteering #7 carried one from the wiki's forecast, with
 * CN's lineup and CN's art, on 2026-10-06. Every other Global-dated one has its Global pool, and
 * its lineup is exactly the one Global's own announcement lists (checked for all 25 announced).
 */
export const GLOBAL_LINEUP_KINDS = new Set(['joint', 'orienteering']);

export function waitsForGlobal(banner) {
  if (!GLOBAL_LINEUP_KINDS.has(banner?.pull_type ?? '') || banner?.globalPoolId || banner?.global_window?.timingSource) return false;
  // A record from before the catalogue linked pools (no CN pool either: the app's bundled
  // snapshot) dates its Global run from history, so its Global date stands; one the catalogue
  // linked to its CN pool, with no Global pool, is not in Global's client yet whatever date the
  // wiki gave it.
  return !banner?.global_date || !!banner?.cnPoolId;
}
