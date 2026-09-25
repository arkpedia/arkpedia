import confirmed from '@/data/skin-availability-windows.json';
import { confirmedWindow, type SkinWindow } from './skinAvailability';

/*
 * PENDING A MAINTAINER DECISION (REVIEW.md SL-4b): keep as an emergency override with an
 * expiry, or remove. Until then this module is the one place browser code may read a bundled
 * data/ table, and the chunk guards allow exactly this import
 * (scripts/build/client-bundle-guard.cjs, scripts/audits/check-client-chunks.mjs). It ships a
 * sale window by redeploy, the opposite of the content release's purpose, and the app's and
 * the data repository's copies can diverge.
 */

/** The app can ship a newly verified sale before the next content release does.
 * Keep the published windows, adding only locally confirmed outfits absent from
 * them. Once the content release catches up, its record takes precedence. */
export function withLocalConfirmedSkinWindows(windows: SkinWindow[]): SkinWindow[] {
  const missing = confirmed.entries.flatMap(entry => {
    const skinIds = entry.skinIds.filter(id => !windows.some(window =>
      !window.estimated && window.kind === entry.kind
      && window.startAt === entry.startAt && window.endAt === entry.endAt
      && window.skinIds.includes(id)));
    return skinIds.length ? [{ ...confirmedWindow(entry), skinIds }] : [];
  });
  return missing.length ? [...windows, ...missing] : windows;
}
