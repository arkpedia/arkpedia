import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nextServer } from '../../lib/time/siteServer';

const ROOT = process.cwd();
function sources(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(tsx?|mjs)$/.test(entry.name) ? [file] : [];
  });
}

test('the nav steps Global, Japan, Korea and round again', () => {
  assert.equal(nextServer('en'), 'jp');
  assert.equal(nextServer('jp'), 'kr');
  assert.equal(nextServer('kr'), 'en');
});

// The site's server is the nav's choice, else the account's (lib/time/siteServer.ts). A page that
// read the account's server itself would ignore the reader's choice: its timings would stay on the
// account's server while the clock showed another.
test('no page or component takes the site\'s server from the account directly', () => {
  const offenders = ['components', 'pages', 'lib'].flatMap(sources).filter(file => {
    if (file === path.join('lib', 'time', 'siteServer.ts')) return false;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return /useAccount\(\)\?\.server|(?:account|storedAccount\(\))\?\.server \?\? 'en'/.test(text);
  });
  assert.deepEqual(offenders, [], 'use useSiteServer() / siteServerNow() from lib/time/siteServer.ts');
});

test('the boot script marks <html> with the site\'s server before the first paint', () => {
  const document = fs.readFileSync(path.join(ROOT, 'pages', '_document.tsx'), 'utf8');
  assert.match(document, /SITE_SERVER_KEY/);
  assert.match(document, /data-site-server/);
});
