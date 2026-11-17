/** Every reader-facing string of the sponsored slots, in one place for a later language layer. */
export const SPONSOR_STRINGS = {
  /** The small tag in the corner of every sponsored artwork. */
  tag: 'Ad',
  region: (sponsor: string) => `Sponsored: ${sponsor}`,
  linkLabel: (sponsor: string, alt: string) => `${alt} (sponsored link to ${sponsor}, opens in a new tab)`,
  /** Shown in the slot's box when the artwork does not load (a content blocker, a failed request). */
  fallback: (sponsor: string) => `Arkpedia is supported by ${sponsor}`,
  supportHeading: 'Our sponsor',
  supportCopy: 'Sponsors help pay for hosting. Sponsored banners are always marked "Ad" and never cover a page\'s content.',
};
