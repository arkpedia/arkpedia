import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/*
 * Every page that builds props from game data is a page of the content release.
 *
 * A page outside scripts/content/pages.json renders from the deploy's own data/ and resolves
 * its art against the deploy's data/assets/revisions.json pin, so it drifts from the rest of the
 * site until the next redeploy. /results was such a page, with nothing saying so. The pages
 * that stay outside are listed here, each with why, so a new one is a decision rather than a
 * default.
 */
const OUTSIDE_THE_RELEASE: Record<string, string> = {
  'pages/community.tsx': 'YouTube listings fetched at ISR, no game data',
  'pages/community/twitch.tsx': 'Twitch listings fetched at ISR, no game data',
  'pages/community/videos.tsx': 'YouTube listings fetched at ISR, no game data',
  'pages/community/youtube-live.tsx': 'YouTube listings fetched at ISR, no game data',
  'pages/events/index.tsx': 'a permanent redirect to /schedule',
  'pages/bases/whole-base-optimizer.tsx': 'development only (devOnlyStaticProps)',
  'pages/optimizer.tsx': 'development only (devOnlyStaticProps)',
  'pages/dev/index.tsx': 'development only (devOnlyStaticProps)',
  'pages/dev/ui.tsx': 'development only (devOnlyStaticProps): the UI primitives gallery',
};

function pageFiles(dir = 'pages'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return file === path.join('pages', 'api') ? [] : pageFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file.split(path.sep).join('/')] : [];
  });
}
const routeOf = (file: string) => {
  const route = file.replace(/^pages/, '').replace(/\.tsx?$/, '').replace(/\/index$/, '');
  return route || '/';
};

test('a page with a data function is in the content release, or listed here with why', () => {
  const released = JSON.parse(fs.readFileSync('scripts/content/pages.json', 'utf8')) as string[];
  const problems: string[] = [];
  for (const file of pageFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/export (?:const|async function) get(?:StaticProps|ServerSideProps)\b/.test(text)) continue;
    const route = routeOf(file);
    const inRelease = released.includes(route);
    if (inRelease !== /withContentPage\s*(?:<[^>]*>)?\s*\(\s*['"]/.test(text)) problems.push(`${file}: pages.json ${inRelease ? 'lists' : 'omits'} ${route} but the page ${inRelease ? 'does not use' : 'uses'} withContentPage`);
    if (!inRelease && !OUTSIDE_THE_RELEASE[file]) problems.push(`${file}: builds props outside the content release; add ${route} to scripts/content/pages.json, or list it in OUTSIDE_THE_RELEASE with why`);
  }
  for (const file of Object.keys(OUTSIDE_THE_RELEASE)) if (!fs.existsSync(file)) problems.push(`${file} is listed as outside the release but no longer exists`);
  assert.deepEqual(problems, []);
  assert.ok(released.includes('/results'));
});
