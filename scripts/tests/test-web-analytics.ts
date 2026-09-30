import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

/*
 * Vercel Web Analytics (2026-09-30): page views on www.arkpedia.net, cookieless. It loads only
 * in a build made for Vercel -- Deploy's `vercel build`, whose pulled project settings carry
 * VERCEL=1. Anywhere else its script, /_vercel/insights/script.js, is a 404: a console error
 * in every browser suite page (request-clock.spec.ts fails on any), and no visitor to count.
 */
const require = createRequire(import.meta.url);
const configFor = (vercel: string | undefined) => {
  const before = process.env.VERCEL;
  try {
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
    delete require.cache[require.resolve('../../next.config.js')];
    return require('../../next.config.js')('phase-test') as { env?: Record<string, string> };
  } finally {
    if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before;
    delete require.cache[require.resolve('../../next.config.js')];
  }
};

test('Web Analytics is switched on by a Vercel build and off everywhere else', () => {
  assert.equal(configFor('1').env?.ARKPEDIA_WEB_ANALYTICS, '1');
  assert.equal(configFor(undefined).env?.ARKPEDIA_WEB_ANALYTICS, '');
  assert.equal(configFor('0').env?.ARKPEDIA_WEB_ANALYTICS, '');
});

test('the app renders the analytics component only behind that switch, from the react entry', () => {
  const app = fs.readFileSync('pages/_app.tsx', 'utf8');
  assert.match(app, /^import \{ Analytics \} from '@vercel\/analytics\/react';$/m);
  assert.match(app, /\{process\.env\.ARKPEDIA_WEB_ANALYTICS === '1' && <Analytics \/>\}/);
  assert.equal((app.match(/<Analytics\b/g) ?? []).length, 1, 'rendered once');
});
