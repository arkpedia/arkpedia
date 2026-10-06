/**
 * How long a download's object URL stays alive after its click. iOS Safari does not read the blob
 * while the click runs: it starts the download after the click has returned, sometimes seconds
 * later behind its "Do you want to download…?" sheet, and an address freed before then gives an
 * empty or failed download. Thirty seconds is long past that and costs one blob held for that
 * long (a planner backup, one reward picture). Exported for scripts/tests/test-download-blob.ts.
 */
export const REVOKE_AFTER_MS = 30_000;

/**
 * Hands the reader `blob` as a download named `filename`: the planner's save where the browser has
 * no save dialog (lib/planner/fileTransfer.ts), and an event's reward picture
 * (components/events/RewardSummary.tsx). One copy, because the two had drifted: the picture's
 * clicked an anchor that was never in the document, which some browsers ignore, and freed its
 * address on another delay.
 *
 * The anchor goes into the document for the click and straight back out. The object URL is freed
 * REVOKE_AFTER_MS later. The planner's copy freed it on the next turn of the event loop, which is
 * enough for a desktop browser (its download has the blob by then) and too soon for iOS Safari.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
