// Runs one of the build scripts content export runs before the pages (scripts/content/
// export.mjs), under the export's clock guard (export-clock.mjs). Their public JSON --
// operator-search.json, the stage guesser's catalogue, the music catalogue, the stage and
// enemy details -- is published in the release beside the pages and read for as long as it
// is live, so a value a build script decides from the clock goes stale the same way.
//
//   node node_modules/tsx/dist/cli.mjs scripts/content/export-build.mjs <script> [args...]
//
// Run through tsx so a TypeScript build script loads; the script sees its own arguments
// after its path, as it would run alone. A script in KNOWN_BUILD_CLOCK_READS has its reads
// recorded, not refused; one that stops reading must leave the list.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildClockVerdict, guardExportClock, KNOWN_BUILD_CLOCK_READS } from './export-clock.mjs';

const [script] = process.argv.slice(2);
if (!script || path.isAbsolute(script) || !/^scripts\/build\/[\w.-]+\.(?:ts|mjs)$/.test(script)) throw new Error(`Expected a build script under scripts/build/, got ${script}`);
const root = `${process.cwd()}${path.sep}`;
const clock = guardExportClock(frame => frame.includes(root) && !frame.includes(`${path.sep}node_modules${path.sep}`) && !frame.includes('export-build.mjs'),
  { refuse: !Object.hasOwn(KNOWN_BUILD_CLOCK_READS, script) });
try {
  await import(pathToFileURL(path.resolve(script)).href);
} finally {
  clock.restore();
}
const verdict = buildClockVerdict(script, clock.reads);
if (verdict) {
  console.error(verdict);
  process.exit(1);
}
