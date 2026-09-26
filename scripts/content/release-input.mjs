/**
 * The two fingerprints of a release. export.mjs writes them into release/manifest.json and
 * validate-release.mjs recomputes them, so both take them from here.
 *
 *   release   every published source file and the generator (the app commit). It names the
 *             release, and arkpedia-data's own validator (content.yml, before it moves the
 *             live pointer) recomputes it the same way, from every file in source/.
 *   content   what the release says: every published source file but the run's own records,
 *             and every page and public data file it serves, by hash. The publish step
 *             compares it with the release data main serves, and a release whose content id
 *             is the same publishes nothing -- no data main commit, no page-cache clear.
 *
 * A file belongs in the content id when a reader gets it or the next run reads it back:
 *
 *   pages, files                what readers get: the props of every page and the public JSON.
 *   data/assets/revisions.json  the asset commits every art and voice URL a page draws is
 *                               pinned to. A new pin changes no page file and every page.
 *   data/quarantine.json,       state the next run hydrates from data main: when each held
 *   data/wiki-cache/*           record was first seen (the three-day overdue mark), and a wiki
 *                               page's last good rows and the hold on it (wiki-pages.mjs).
 *                               Left unpublished, a kept-previous entry -- which by definition
 *                               changes no page -- would start again every day and never go
 *                               overdue.
 *
 * Left out, because neither is true of them:
 *
 *   generator                   the app commit. Every merge to main moves it, docs and tests
 *                               included, and it made a release of a day on which no source,
 *                               page or public file changed (arkpedia-data 3c128fd, 2026-09-16).
 *                               What the code produces is in the page and file hashes, so a code
 *                               change that alters a page still publishes; one that alters none
 *                               leaves data main serving bytes the new code would write again.
 *                               The release id keeps it, so export.mjs still re-exports every
 *                               page after a code change.
 *   data/upstream.lock.json     the mirror commits the run read (pin-upstream.mjs). A mirror
 *                               commits most days, art-only commits and all, and on a day one
 *                               cannot be reached the lock says so; neither changes a record.
 *                               It is read back only as the fallback pin for a mirror a later
 *                               run cannot reach, and a commit from a few days earlier serves
 *                               that just as well.
 *   data/catalogue-sync.json    the catalogue stage's report of the run: what it added, linked
 *                               and renamed that day, at which mirror commits.
 *
 * Both run records are still published with every release; data main keeps them as of the
 * last release whose content changed.
 */
import { createHash } from 'node:crypto';

export const SCHEMA = 2;
export const RUN_RECORDS = new Set(['data/upstream.lock.json', 'data/catalogue-sync.json']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Code-point order, so the id does not depend on the order a caller listed things in.
const sorted = entries => entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
// Where each output is as well as what it holds: the site finds a page by the path the manifest
// gives and refuses a manifest whose paths its own pageFilePath() would not give
// (lib/content/server.ts), so a move with the same bytes is still something to publish.
const outputsOf = (outputs, kind) => {
  if (!outputs || typeof outputs !== 'object') throw new TypeError(`The content id needs the release's ${kind}, as the manifest lists them`);
  return Object.fromEntries(sorted(Object.entries(outputs).map(([name, file]) => {
    if (typeof file?.path !== 'string' || !/^[a-f0-9]{64}$/.test(file?.sha256 ?? '')) throw new TypeError(`The content id needs the path and sha256 of ${kind} ${name}`);
    return [name, [file.path, file.sha256]];
  })));
};

/** The release id: the generator and every published source file's hash. */
export const releaseInput = ({ generator, sourceHashes }) => sha(JSON.stringify({ schema: SCHEMA, generator, sourceHashes }));
/** The content id: the source files less the run's records, and the pages and public files
 *  the release serves ({ path, bytes, sha256 } each, as the manifest has them). No generator. */
export const contentInput = ({ sourceHashes, pages, files }) => {
  if (!sourceHashes || typeof sourceHashes !== 'object') throw new TypeError('The content id needs the source hashes');
  return sha(JSON.stringify({
    schema: SCHEMA,
    sourceHashes: Object.fromEntries(sorted(Object.entries(sourceHashes).filter(([file]) => !RUN_RECORDS.has(file)))),
    pages: outputsOf(pages, 'pages'),
    files: outputsOf(files, 'files'),
  }));
};
