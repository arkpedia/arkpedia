import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { downloadBlob, REVOKE_AFTER_MS } from '../../lib/ui/downloadBlob';

/*
 * lib/ui/downloadBlob.ts, the one blob download (the planner's backup where there is no save
 * dialog, an event's reward picture), against a stand-in document: Node has none. What a browser
 * needs from it is the order of things, and that the address outlives the click: iOS Safari reads
 * the blob after the click has returned, and failed the download when it was freed a tick later.
 */
const events: string[] = [];

beforeEach(() => {
  events.length = 0;
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(URL, 'createObjectURL', () => { events.push('create'); return 'blob:test/1'; });
  mock.method(URL, 'revokeObjectURL', (url: string) => { events.push(`revoke ${url}`); });
  const anchor = {
    href: '', download: '',
    click() { events.push(`click ${anchor.href} as ${anchor.download}`); },
    remove() { events.push('remove'); },
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => { assert.equal(tag, 'a'); return anchor; },
    body: { appendChild: () => { events.push('append'); } },
  };
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
  delete (globalThis as { document?: unknown }).document;
});

test('the anchor is in the document for its click and out straight after', () => {
  downloadBlob(new Blob(['{}'], { type: 'application/json' }), 'arkpedia-planner.json');
  assert.deepEqual(events, ['create', 'append', 'click blob:test/1 as arkpedia-planner.json', 'remove']);
});

test('the address is kept for REVOKE_AFTER_MS after the click, then freed', () => {
  assert.ok(REVOKE_AFTER_MS >= 30_000, 'long enough for iOS Safari to start the download');
  downloadBlob(new Blob(['png']), 'People, A People rewards.png');
  mock.timers.tick(0);
  mock.timers.tick(REVOKE_AFTER_MS - 1);
  assert.ok(!events.some((e) => e.startsWith('revoke')), 'still alive a moment before the delay is up');
  mock.timers.tick(1);
  assert.equal(events.at(-1), 'revoke blob:test/1');
});
