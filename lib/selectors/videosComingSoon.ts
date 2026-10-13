/**
 * The selector tickets whose How to Use videos Kukki is recording (2026-10-13): an operator in
 * them without a video yet says "Coming soon" instead of leaving the line blank. Read by the
 * dialog at render time rather than carried in the compiled page props, so it shows as soon as
 * this code deploys, without waiting for a content run compiled by it.
 */
export const VIDEOS_COMING_SOON: ReadonlySet<string> = new Set([
  'Top Operator Transfer Permit - Starter',
  'Special Event Transfer Permit',
]);
