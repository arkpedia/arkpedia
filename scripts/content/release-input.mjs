/**
 * The two fingerprints of a release. export.mjs writes them into release/manifest.json and
 * validate-release.mjs recomputes them, so both take them from here.
 *
 *   release   every published source file and the generator (the app commit). It names the
 *             release, and arkpedia-data's own validator (content.yml, before it moves the
 *             live pointer) recomputes it the same way, from every file in source/.
 *   content   the same, less the two source files that describe the RUN, not the content:
 *
 *     data/upstream.lock.json   the mirror commits the run read (pin-upstream.mjs). A mirror
 *                               commits most days, art-only commits and all, and on a day one
 *                               cannot be reached the lock says so; neither changes a record.
 *     data/catalogue-sync.json  the catalogue stage's report of the run: what it added, linked
 *                               and renamed that day, at which mirror commits.
 *
 * Both files are still published with every release. The publish step compares content ids:
 * a day on which only they changed has a new release id but says nothing the release data
 * main serves does not, so it publishes nothing -- no data main commit, no page-cache clear.
 * Data main then keeps both files as of the last release whose content changed; the lock is
 * read back only as the fallback pin for a mirror a later run cannot reach, and a commit from
 * a few days earlier serves that just as well.
 */
import { createHash } from 'node:crypto';

export const SCHEMA = 2;
export const RUN_RECORDS = new Set(['data/upstream.lock.json', 'data/catalogue-sync.json']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** The release id: the generator and every published source file's hash. */
export const releaseInput = ({ generator, sourceHashes }) => sha(JSON.stringify({ schema: SCHEMA, generator, sourceHashes }));
/** The content id: the same, without the run's own records. */
export const contentInput = ({ generator, sourceHashes }) => releaseInput({ generator,
  sourceHashes: Object.fromEntries(Object.entries(sourceHashes).filter(([file]) => !RUN_RECORDS.has(file))) });
