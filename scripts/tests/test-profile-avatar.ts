import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarCatalogue, PROFILE_AVATAR_KEY, saveProfileAvatar } from '../../lib/account/profileAvatar';
import { CLOUD_KEYS } from '../../lib/cloud-account/data';

test('avatar IDs are published icon paths and cannot enter the cloud replacement contract', async () => {
  const published = new Set(JSON.parse(readFileSync('data/assets/public-asset-index.json', 'utf8')).files);
  const ids = await avatarCatalogue();
  assert.ok(ids.length > 1000);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) { assert.ok(published.has(id), id); assert.ok(!id.split('/').includes('..') && !id.includes('://')); }
  assert.ok(!CLOUD_KEYS.includes(PROFILE_AVATAR_KEY));
  await assert.rejects(saveProfileAvatar('https://invalid.example/avatar.png'), /Choose an icon/);
  await assert.rejects(saveProfileAvatar('six-star-icons/../../secret.png'), /Choose an icon/);
});
