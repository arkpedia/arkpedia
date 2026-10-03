import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHANGELOG, LATEST_CHANGE } from '../../lib/changelog/entries';

/* The What's new page (lib/changelog/entries.ts): newest first, real dates, and every item
   saying something, with any link pointing at a page the site has. */
test('the changelog is newest first, dated, and every entry says something', () => {
  assert.ok(CHANGELOG.length > 0);
  assert.equal(LATEST_CHANGE, CHANGELOG[0].date);
  for (const [index, entry] of CHANGELOG.entries()) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, `${entry.date}: a YYYY-MM-DD date`);
    assert.ok(!Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`)), `${entry.date}: a real day`);
    if (index > 0) assert.ok(entry.date < CHANGELOG[index - 1].date, `${entry.date} comes after ${CHANGELOG[index - 1].date}: newest first, one entry a day`);
    const items = [...(entry.added ?? []), ...(entry.changed ?? []), ...(entry.fixed ?? [])];
    assert.ok(items.length > 0, `${entry.date}: something added, changed or fixed`);
    for (const item of items) {
      assert.ok(item.text.trim().length > 10, `${entry.date}: "${item.text}" says too little`);
      if (item.href) {
        const page = item.href === '/' ? 'index' : item.href.slice(1);
        assert.ok(['tsx', 'ts'].some((ext) => fs.existsSync(path.join('pages', `${page}.${ext}`)) || fs.existsSync(path.join('pages', page, `index.${ext}`))), `${item.href}: a page the site has`);
      }
    }
  }
});
