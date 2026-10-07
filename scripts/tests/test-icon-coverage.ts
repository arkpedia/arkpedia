import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkIconCoverage } from '../audits/check-icon-coverage';

/* A roster of two: an operator out on Global since 2019, and one announced for later. The
   image repository has published what `files` lists. */
function withRoster(use: (fixture: ReturnType<typeof roster>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-icons-'));
  try { use(roster(root)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function roster(root: string) {
  const write = (file: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(data));
  };
  const released = { name: 'Frontline', internalName: 'char_901_front', rarity: 6, class: 'Guard', characterInfo: { 'Release Date': '2019/04/30' }, skills: { skillList: [{ name: 'Charge' }] } };
  const upcoming = { name: 'Newcomer', internalName: 'char_902_new', rarity: 5, class: 'Guard', faction: 'Nowhere', characterInfo: { 'Release Date': '2026-10-01' } };
  const files = ['six-star-icons/Frontline - Base.webp', 'skill-icons/Frontline - Charge.webp', 'class-icons/Guard.webp', 'five-star-icons/Newcomer - Base.webp', 'essential-icons/Arkpedia.webp',
    // The account card's assistant avatar: each default art's icon and each outfit's.
    'six-star-icons/Frontline - Elite 2.webp', 'six-star-icons/Frontline - Summer Shift.webp', 'five-star-icons/Newcomer - Elite 2.webp', 'five-star-icons/Newcomer - Night Shift.webp'];
  // The account map's operators and the catalogue's outfits, which pages/account.tsx gives the card.
  const chars: Record<string, { name: string; rarity: number }> = { char_901_front: { name: 'Frontline', rarity: 6 }, char_902_new: { name: 'Newcomer', rarity: 5 } };
  const skins = [{ name: 'Summer Shift', model: 'Frontline', skinId: 'char_901_front@summer#1' }, { name: 'Night Shift', model: 'Newcomer', skinId: 'char_902_new@night#1' }];
  const save = () => {
    write('data/operators-6star/Frontline.json', released);
    write('data/operators-5star/Newcomer.json', upcoming);
    write('data/assets/external-asset-index.json', { files });
    write('data/game-account-map.json', { version: 1, chars });
    write('data/skins.json', skins);
  };
  save();
  const run = (quarantine: boolean) => {
    save();
    return checkIconCoverage({ root, now: new Date('2026-09-20T20:00:00Z'), quarantine, minOperators: 2 });
  };
  const held = () => JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries
    .map(({ key, stage, action, reason, firstSeen }: Record<string, string>) => ({ key, stage, action, reason, firstSeen }));
  return { root, write, released, files, chars, skins, run, held };
}

test('a complete roster passes both ways, and the release clears the icons it held yesterday', () => {
  withRoster(roster => {
    roster.write('data/quarantine.json', { version: 1, entries: [
      { key: 'banner:X', stage: 'catalogue', reason: 'no art', action: 'published-partial', firstSeen: '2026-09-01', lastSeen: '2026-09-01' },
      { key: 'operator:char_901_front', stage: 'icons', reason: 'yesterday', action: 'published-partial', firstSeen: '2026-09-19', lastSeen: '2026-09-19' },
    ] });
    const strict = roster.run(false);
    assert.equal(strict.exitCode, 0, strict.errors.join('\n'));
    // The upcoming operator's missing emblem is listed, never failed or held.
    assert.match(strict.out.join('\n'), /1 icon path\(s\) missing on 1 operator\(s\) not yet released on Global -- reported, not failed:\n {2}faction-icons\/Nowhere\.webp {2}\(faction icon for Newcomer\)/);
    assert.equal(roster.run(true).exitCode, 0);
    assert.deepEqual(roster.held().map((entry: { key: string }) => entry.key), ['banner:X']);
  });
});

test('on a Global launch rename a released operator\'s missing icons fail a pull request but only hold back the icons in the release', () => {
  withRoster(roster => {
    // The record takes its official name; the art under that name has not landed yet.
    roster.released.name = 'Frontline the Official';
    const strict = roster.run(false);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /^2 icon path\(s\) point at files that are not published:\n {2}six-star-icons\/Frontline the Official - Base\.webp {2}\(roster icon for Frontline the Official\)\n {2}skill-icons\/Frontline the Official - Charge\.webp/);
    const release = roster.run(true);
    assert.equal(release.exitCode, 0, 'never what stops the daily release');
    assert.match(release.out[0], /^2 icon path\(s\) on 1 released operator\(s\) are not published yet -- held back as quarantine entries \(stage 'icons' in data\/quarantine\.json\), not failed:/);
    assert.deepEqual(roster.held(), [{ key: 'operator:char_901_front', stage: 'icons', action: 'published-partial', firstSeen: '2026-09-20',
      reason: 'Frontline the Official: icon(s) not published yet, shown blank: six-star-icons/Frontline the Official - Base.webp, skill-icons/Frontline the Official - Charge.webp' }]);
    // The next day the art is published under the new name: the entry goes.
    roster.files.push('six-star-icons/Frontline the Official - Base.webp', 'skill-icons/Frontline the Official - Charge.webp');
    assert.equal(roster.run(true).exitCode, 0);
    assert.deepEqual(roster.held(), []);
  });
});

test('the portrait placeholder every unpublished operator shows must itself be published', () => {
  withRoster(roster => {
    roster.files.splice(roster.files.indexOf('essential-icons/Arkpedia.webp'), 1);
    const strict = roster.run(false);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /essential-icons\/Arkpedia\.webp {2}\(portrait placeholder for every operator without one\)/);
    assert.equal(roster.run(true).exitCode, 0, 'reported, never what stops the daily release');
  });
});

test("an outfit without its icon fails a pull request, and in the release holds back only the account card's icon for it", () => {
  withRoster(roster => {
    // The bug of 2026-10: the card drew nothing for an assistant avatar. A new outfit whose icon
    // is not published would show the Base icon instead; caught here, not by a reader.
    roster.files.splice(roster.files.indexOf('six-star-icons/Frontline - Summer Shift.webp'), 1);
    const strict = roster.run(false);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /^1 icon path\(s\) point at files that are not published:\n {2}six-star-icons\/Frontline - Summer Shift\.webp {2}\(assistant avatar icon for char_901_front@summer#1 \(account card\)\)/);
    assert.equal(roster.run(true).exitCode, 0, 'never what stops the daily release');
    assert.deepEqual(roster.held(), [{ key: 'skin:char_901_front@summer#1', stage: 'icons', action: 'published-partial', firstSeen: '2026-09-20',
      reason: "Frontline: outfit icon not published yet, the account card's assistant avatar shows the Base icon: six-star-icons/Frontline - Summer Shift.webp" }]);
    // An operator not out on Global yet: its outfit's gap is listed, never failed.
    roster.files.push('six-star-icons/Frontline - Summer Shift.webp');
    roster.files.splice(roster.files.indexOf('five-star-icons/Newcomer - Night Shift.webp'), 1);
    const upcoming = roster.run(false);
    assert.equal(upcoming.exitCode, 0, upcoming.errors.join('\n'));
    assert.match(upcoming.out.join('\n'), /five-star-icons\/Newcomer - Night Shift\.webp {2}\(assistant avatar icon for char_902_new@night#1 \(account card\)\)/);
  });
});

test("every default art's icon is checked too: Elite 2 from 4 stars, and Amiya's Elite 1", () => {
  withRoster(roster => {
    roster.files.splice(roster.files.indexOf('six-star-icons/Frontline - Elite 2.webp'), 1);
    assert.match(roster.run(false).errors.join('\n'), /six-star-icons\/Frontline - Elite 2\.webp {2}\(assistant avatar icon for char_901_front#2 \(account card\)\)/);
    roster.files.push('six-star-icons/Frontline - Elite 2.webp');
    // Amiya at Elite 1 ("#1+") has art of her own; the card asks for it by that name.
    roster.write('data/operators-5star/Amiya.json', { name: 'Amiya', internalName: 'char_002_amiya', rarity: 5, characterInfo: { 'Release Date': '2019/04/30' } });
    roster.chars.char_002_amiya = { name: 'Amiya', rarity: 5 };
    roster.files.push('five-star-icons/Amiya - Base.webp', 'five-star-icons/Amiya - Elite 2.webp');
    const strict = roster.run(false);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /^1 icon path\(s\) point at files that are not published:\n {2}five-star-icons\/Amiya - Elite 1\.webp {2}\(assistant avatar icon for char_002_amiya#1\+ \(account card\)\)/);
    roster.files.push('five-star-icons/Amiya - Elite 1.webp');
    assert.equal(roster.run(false).exitCode, 0);
  });
});

test('the pull-request check stays strict and the daily release runs the quarantining one', () => {
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts['check:assets:release'], `${scripts['check:assets']} --quarantine`, 'the same checks, only the icon gaps quarantined');
  const release = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.match(release, /\n {10}npm run check:assets:release\n/);
  assert.doesNotMatch(release, /npm run check:assets(?![:\w])/);
  assert.match(fs.readFileSync('.github/workflows/check.yml', 'utf8'), /run: npm run check:assets && npm run check:published-assets\n/);
});
