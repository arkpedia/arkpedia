import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Plain Node helper shared by the sync scripts.
import { branchHead, headQueries } from '../lib/branch-head.mjs';

/*
 * On 2026-10-15 GitHub answered 409 "Git Repository is empty" for arkpedia-image-assets's main
 * on the commits API through a whole content run, while `git ls-remote` and the branches API
 * named its head. asset-revisions asked the commits API once, the three stages that pin the art
 * failed, and the release kept a pin without the art Global had renamed. These hold the rule:
 * a head comes from whichever way answers, and no single refusal is the answer.
 */
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const noPause = async () => {};
const refused = (message: string) => Object.assign(new Error(`Command failed: ${message}`), { stderr: message });

test('a head comes from git itself first, then the branches API, then the commits API', async () => {
  const asked: string[] = [];
  const run = async (command: string, args: string[]) => {
    asked.push(`${command} ${args[0]}`);
    if (command === 'git') return `${SHA}\trefs/heads/main\n`;
    throw new Error('not asked');
  };
  assert.equal(await branchHead('arkpedia/arkpedia-image-assets', 'main', { run, sleep: noPause }), SHA);
  assert.deepEqual(asked, ['git ls-remote']);
  assert.deepEqual(headQueries('arkpedia/x', 'main').map((query: { how: string }) => query.how), ['git ls-remote', 'branches API', 'commits API']);
});

test('the 409 of 2026-10-15 on the commits API does not stop the pin when another way answers', async () => {
  const asked: string[] = [];
  const run = async (command: string, args: string[]) => {
    const how = command === 'git' ? 'git' : args[1].includes('/branches/') ? 'branches' : 'commits';
    asked.push(how);
    if (how === 'git') throw refused('fatal: unable to access');
    if (how === 'branches') return `${OTHER}\n`;
    throw refused('gh: Git Repository is empty. (HTTP 409)');
  };
  assert.equal(await branchHead('arkpedia/arkpedia-image-assets', 'main', { run, sleep: noPause }), OTHER);
  assert.deepEqual(asked, ['git', 'branches']);
});

test('a head no way names in a round is asked again, and only every round failing fails', async () => {
  let round = 0;
  const pauses: number[] = [];
  const run = async (command: string) => {
    if (command === 'git') round += 1;
    if (round < 3) throw refused('gh: Git Repository is empty. (HTTP 409)');
    return command === 'git' ? `${SHA}\trefs/heads/main` : '';
  };
  assert.equal(await branchHead('arkpedia/r', 'main', { run, sleep: async (ms: number) => { pauses.push(ms); }, backoffMs: 10, log: () => {} }), SHA);
  assert.deepEqual(pauses, [10, 20]);
  const never = async () => { throw refused('gh: Git Repository is empty. (HTTP 409)'); };
  await assert.rejects(branchHead('arkpedia/r', 'main', { run: never, sleep: noPause, log: () => {} }), /Cannot resolve arkpedia\/r main after 3 rounds: .*HTTP 409/);
  // An answer that is not a commit is no head either.
  const garbage = async () => 'Not Found';
  await assert.rejects(branchHead('arkpedia/r', 'main', { run: garbage, sleep: noPause, rounds: 1 }), /answered "Not Found"/);
});

test('the stages that move the art pins resolve heads this way, never by one API call', () => {
  const updater = fs.readFileSync('scripts/sync/update-asset-revisions.mjs', 'utf8');
  assert.match(updater, /branchHead\(`arkpedia\/\$\{repo\}`, 'main'\)/);
  assert.doesNotMatch(updater, /commits\/main|\/git\/ref/, 'no single ask of the commits or refs API');
});
