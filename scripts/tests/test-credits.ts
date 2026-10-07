import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CREDIT_GROUPS, CREDITED_ELSEWHERE, OWN_REPOSITORIES, githubRepository, linkLabel } from '../../lib/credits/sources';
import { LINKS } from '../../lib/nav/navLinks';

/*
 * The Credits page (pages/credits.tsx) names every GitHub repository the site's code takes data
 * or art from. This scans the code -- scripts, pages, components, lib, workflows; not the tests,
 * whose fixtures name made-up repositories -- for the repositories it fetches or checks out, so a
 * new source fails here until it is credited, and a source the code stopped using leaves the page.
 */

const ROOTS = ['lib', 'scripts', 'pages', 'components', 'config', '.github'];
const SKIP_DIRS = new Set(['node_modules', 'tests', 'fixtures', 'vendor']);
const SELF = path.join('lib', 'credits', 'sources.ts');
const NAME = '[A-Za-z0-9_.-]+';
const PATTERNS = [
  // A link, a raw file or a CDN copy of one.
  new RegExp(`(?:https?://(?:www\\.)?github\\.com|raw\\.githubusercontent\\.com|cdn\\.jsdelivr\\.net/gh)/(${NAME})/(${NAME})`, 'g'),
  // A checkout or pin: { repository: 'owner/name' }, const REPO = 'owner/name'.
  new RegExp(`\\b(?:repository|REPO|repo)\\s*[:=]\\s*['"](${NAME})/(${NAME})['"]`, 'g'),
];

function referenced(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(at); continue; }
      if (at === SELF || !/\.(m?[jt]sx?|py|ya?ml|json|sh)$/.test(entry.name)) continue;
      const text = fs.readFileSync(at, 'utf8');
      for (const pattern of PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          const repository = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
          if (!found.has(repository)) found.set(repository, at);
        }
      }
    }
  };
  for (const root of ROOTS) if (fs.existsSync(root)) walk(root);
  return found;
}

const LINKS_CREDITED = CREDIT_GROUPS.flatMap((group) => group.sources.flatMap((source) => source.links));
const credited = new Set(LINKS_CREDITED.map(githubRepository).filter((repository): repository is string => repository !== null));

test('every GitHub repository the code takes data or art from is on the Credits page', () => {
  const found = referenced();
  assert.ok(found.size > 10, `the scan found ${found.size} repositories`);
  const missing = [...found].filter(([repository]) => !credited.has(repository)
    && !CREDITED_ELSEWHERE.some((pattern) => pattern.test(repository)));
  assert.deepEqual(missing.map(([repository, file]) => `${repository} (${file})`), [],
    'credit these in lib/credits/sources.ts: a name and the repository link');
});

test('the Credits page names no repository the code no longer uses', () => {
  const found = referenced();
  assert.deepEqual([...credited].filter((repository) => !found.has(repository)), []);
});

test('every credited link is https, written short, and the nav links the page', () => {
  for (const href of [...LINKS_CREDITED, ...OWN_REPOSITORIES]) {
    assert.match(href, /^https:\/\/[^\s]+$/, href);
    // A GitHub link is the repository itself, so the scan above can count it.
    if (new URL(href).hostname === 'github.com') assert.ok(githubRepository(href), `${href}: a repository link`);
    assert.ok(linkLabel(href).length <= 60, `${href}: written as ${linkLabel(href)}`);
  }
  assert.equal(linkLabel('https://github.com/Kengxxiao/ArknightsGameData'), 'github.com/Kengxxiao/ArknightsGameData');
  assert.equal(linkLabel('https://www.canva.com/design/DAHBABXJpds/tgUQ72n0pCw8HHq56-OBOA/view'), 'canva.com');
  assert.equal(linkLabel('https://ak.hypergryph.com'), 'ak.hypergryph.com');
  assert.ok(LINKS.some((link) => link.href === '/credits'), 'the nav links /credits');
});

test("Arkpedia's own credited repositories are its public ones", () => {
  for (const href of OWN_REPOSITORIES) assert.match(href, /^https:\/\/github\.com\/arkpedia\/arkpedia-[a-z0-9-]+$/, href);
  // The site's own repository and the relay are private: a link to them is a 404 for a reader.
  assert.ok(!OWN_REPOSITORIES.some((href) => /\/arkpedia\/(arkpedia|arkpedia-relay)$/.test(href)));
});
