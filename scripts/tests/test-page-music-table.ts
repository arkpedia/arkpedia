import test from 'node:test';
import assert from 'node:assert/strict';
import { pageMusicTable } from '../../lib/music/pageMusicServer';
import { eventMusicId } from '../../lib/music/pageMusic';
import { pageTables } from '../../lib/content/tables.mjs';

test('content releases carry event lobby associations without turning on any audio', () => {
  assert.ok(pageTables('/events/[slug]').includes('page-music'));
  const table = pageMusicTable([
    { names: ['Yet Another Wave', '昨日海'], characters: [], source: 'https://prts.wiki/w/音乐鉴赏/游戏内音乐一览', tracks: [{id:'306864',role:'lobby'},{id:'461109',role:'boss'}] },
    { names: ['PV only'], characters: [], source: '', tracks: [{id:'123456',role:'battle'}] },
  ]);
  assert.equal(eventMusicId('[Rerun] Yet Another Wave Rerun', table), '306864');
  assert.equal(eventMusicId('[Side Story] 昨日海', table), '306864');
  assert.equal(eventMusicId('PV only', table), null);
  assert.equal(eventMusicId('Unknown event', table), null);
});
