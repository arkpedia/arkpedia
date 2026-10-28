import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalUrl, pageTitle, SITE_ORIGIN } from '../../lib/seo/site';

/* Every page says what it is: a title, a description and the address it is indexed under, through
 * PageMeta (components/layout/PageMeta.tsx). Before it, 794 of the 839 published pages shared
 * one title and one description (the operator, stage-content and event pages among them). */

/** A page without PageMeta, and why. */
const EXCEPTIONS: Record<string, string> = {
  'pages/home.tsx': 'a redirect to /',
  'pages/events/index.tsx': 'a permanent redirect to /schedule',
  'pages/music/[albumId].tsx': 'a redirect to /music',
  'pages/sitemap.xml.tsx': 'the sitemap itself, no document',
  'pages/stages/browse.tsx': 'sets its own title and description from the stage on screen',
  'pages/enemies/index.tsx': 'sets its own title and description from the enemy on screen',
};

function pageFiles(dir = 'pages'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'api' || entry.name === 'dev' ? [] : pageFiles(file);
    return /\.tsx$/.test(entry.name) && !/^_/.test(entry.name) ? [file] : [];
  });
}

test('every page carries PageMeta, or sets its own title and description, or is listed here with why', () => {
  const problems: string[] = [];
  for (const file of pageFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    if (/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*export \{ default[^\n]*\} from '/.test(text)) continue; // another page under a second name
    if (file in EXCEPTIONS) {
      if (/<PageMeta/.test(text)) problems.push(`${file} has PageMeta: drop it from the exceptions`);
      else if (/browse|enemies/.test(file) && !(/<title>/.test(text) && /name="description"/.test(text))) problems.push(`${file} no longer sets its own title and description`);
      continue;
    }
    if (!/<PageMeta\b/.test(text)) problems.push(`${file} has no PageMeta`);
    if (/<title>/.test(text)) problems.push(`${file} still writes a <title> beside PageMeta`);
  }
  for (const file of Object.keys(EXCEPTIONS)) if (!fs.existsSync(file)) problems.push(`${file} is excepted but no longer exists`);
  assert.deepEqual(problems, []);
});

test('the title and the canonical address take the site\'s form', () => {
  assert.equal(pageTitle('Farming Guide'), 'Farming Guide — Arkpedia');
  assert.equal(SITE_ORIGIN, 'https://www.arkpedia.net');
  assert.equal(canonicalUrl('/farming'), 'https://www.arkpedia.net/farming');
  assert.equal(canonicalUrl('/'), 'https://www.arkpedia.net/');
  // An old route name is indexed under its public name (config/pilot-route-aliases.json).
  assert.equal(canonicalUrl('/pulls'), 'https://www.arkpedia.net/pull-planner');
  assert.equal(canonicalUrl('/gamemodes/stronghold-protocol'), 'https://www.arkpedia.net/game-modes/stronghold-protocol');
  // The address keeps its encoding and loses its query and fragment.
  assert.equal(canonicalUrl("/operators/Ch'en%20the%20Holungday#skills"), "https://www.arkpedia.net/operators/Ch'en%20the%20Holungday");
  assert.equal(canonicalUrl('/enemies?e=slug'), 'https://www.arkpedia.net/enemies');
});

test('pages/_app.tsx keys its fallback tags the way PageMeta does, so a page\'s values replace them', () => {
  const app = fs.readFileSync('pages/_app.tsx', 'utf8');
  const meta = fs.readFileSync('components/layout/PageMeta.tsx', 'utf8');
  for (const key of ['title', 'description', 'og:title', 'og:description', 'og:image']) {
    assert.match(app, new RegExp(`key="${key}"`), `_app keys ${key}`);
    assert.match(meta, new RegExp(`key="${key}"`), `PageMeta keys ${key}`);
  }
});
