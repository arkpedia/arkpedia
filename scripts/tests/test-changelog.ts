import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHANGELOG, LATEST_CHANGE } from '../../lib/changelog/entries';

/* The What's new page (lib/changelog/entries.ts): newest first, real dates, and every item
   saying something, with any link pointing at a page the site has. */
test('the changelog is newest first, dated, and every entry says something', () => {
  assert.ok(CHANGELOG.length > 0);
  assert.equal(LATEST_CHANGE, CHANGELOG[0].at);
  for (const [index, entry] of CHANGELOG.entries()) {
    // One instant for every reader, in UTC: the page shows it in each reader's own zone.
    assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${entry.at}: a UTC instant, YYYY-MM-DDTHH:MM:SSZ`);
    assert.equal(new Date(entry.at).toISOString().replace('.000', ''), entry.at, `${entry.at}: a real moment`);
    if (index > 0) assert.ok(entry.at < CHANGELOG[index - 1].at, `${entry.at} comes after ${CHANGELOG[index - 1].at}: newest first`);
    const items = [...(entry.added ?? []), ...(entry.changed ?? []), ...(entry.fixed ?? [])];
    assert.ok(items.length > 0, `${entry.at}: something added, changed or fixed`);
    for (const item of items) {
      assert.ok(item.text.trim().length > 10, `${entry.at}: "${item.text}" says too little`);
      if (item.href) {
        const page = item.href === '/' ? 'index' : item.href.slice(1);
        assert.ok(['tsx', 'ts'].some((ext) => fs.existsSync(path.join('pages', `${page}.${ext}`)) || fs.existsSync(path.join('pages', page, `index.${ext}`))), `${item.href}: a page the site has`);
      }
    }
  }
});

test('an entry\'s moment is written in UTC on the server and in the reader\'s zone once mounted', async () => {
  const { formatInstant } = await import('../../components/ui/LocalTime');
  assert.equal(formatInstant('2026-10-05T08:26:00Z', 'UTC'), '5 Oct 2026, 08:26 UTC');
  // The zone's name is ICU's (CEST, GMT+8 ...), which differs between Node builds: the time is the point.
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'Europe/Berlin'), /^5 Oct 2026, 10:26 \S+$/);
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'Asia/Shanghai'), /^5 Oct 2026, 16:26 \S+$/);
  // Across midnight the reader's day is the one shown.
  assert.match(formatInstant('2026-10-05T23:30:00Z', 'Asia/Tokyo'), /^6 Oct 2026, 08:30 \S+$/);
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'America/Los_Angeles'), /^5 Oct 2026, 01:26 \S+$/);
});
