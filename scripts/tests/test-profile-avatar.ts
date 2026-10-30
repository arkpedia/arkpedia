import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATAR_CATALOGUE, avatarCatalogue, PROFILE_AVATAR_KEY, saveProfileAvatar } from '../../lib/account/profileAvatar';
import { CLOUD_KEYS } from '../../lib/cloud-account/data';

/* The catalogue is public/profile-avatars.json, copied from data/profile-avatars.json, which the import builds nightly; the
   site fetches from the live release (contentUrl), falling back to the deployed copy. */
const RELEASE = 'https://cdn.example/release/public/profile-avatars.json';
function serving(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const fetch = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    asked.push(String(input));
    const body = answers[String(input)];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  }) as typeof globalThis.fetch;
  return { asked, restore: () => { globalThis.fetch = fetch; } };
}
const catalogue = { version: 1, icons: ['six-star-icons/Surtr - Base.webp', 'base-skill-icons/Surtr - Pyroclast.webp'], facilities: { 'base-skill-icons/Surtr - Pyroclast.webp': 'Factory' } };

test('the catalogue comes from the release, or the deployed copy while the release predates it, and is cached by release', async () => {
  const live = serving({ [`${RELEASE}?a`]: catalogue });
  try {
    assert.deepEqual(await avatarCatalogue(`${RELEASE}?a`), { icons: catalogue.icons, facilities: catalogue.facilities });
    await avatarCatalogue(`${RELEASE}?a`);
    assert.deepEqual(live.asked, [`${RELEASE}?a`], 'asked once per release');
  } finally { live.restore(); }
  const older = serving({ [AVATAR_CATALOGUE]: catalogue });
  try {
    assert.deepEqual((await avatarCatalogue(`${RELEASE}?b`)).icons, catalogue.icons);
    assert.deepEqual(older.asked.filter(url => url === AVATAR_CATALOGUE), [AVATAR_CATALOGUE], 'a release without the file falls back to the deployed copy');
  } finally { older.restore(); }
  const broken = serving({ [`${RELEASE}?c`]: { version: 1, icons: [7], facilities: {} } });
  try { await assert.rejects(avatarCatalogue(`${RELEASE}?c`), /unavailable/); } finally { broken.restore(); }
});

test('a stored avatar must be an exact catalogue icon, and never enters the cloud replacement contract', async () => {
  assert.ok(!CLOUD_KEYS.includes(PROFILE_AVATAR_KEY));
  const live = serving({ [`${RELEASE}?d`]: catalogue });
  try {
    await assert.rejects(saveProfileAvatar('https://invalid.example/avatar.png', `${RELEASE}?d`), /Choose an icon/);
    await assert.rejects(saveProfileAvatar('six-star-icons/../../secret.png', `${RELEASE}?d`), /Choose an icon/);
  } finally { live.restore(); }
});

test('the published catalogue names only published icon paths', { skip: !existsSync('data/profile-avatars.json') && 'the live release predates data/profile-avatars.json' }, () => {
  const published = new Set(JSON.parse(readFileSync('data/assets/public-asset-index.json', 'utf8')).files);
  const { icons, facilities } = JSON.parse(readFileSync('data/profile-avatars.json', 'utf8'));
  assert.ok(icons.length > 1000);
  assert.equal(new Set(icons).size, icons.length);
  for (const id of icons) { assert.ok(published.has(id), id); assert.ok(!id.split('/').includes('..') && !id.includes('://')); }
  for (const id of Object.keys(facilities)) assert.ok(icons.includes(id), id);
});
