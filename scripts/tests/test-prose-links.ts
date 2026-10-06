import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

/*
 * A link in running text (.sub, .hint: the page header's line and the site's hints) is teal,
 * visited or not (styles/core/shared.css). On 2026-10-03 a rule pasted into the middle of that
 * selector list (".sub a, /* ... *\/ .toolbar-spacer { ... }") left .sub links with no colour of
 * their own, so a page header's links came out in the browser's blue-purple and went teal
 * only once visited, which read as "clicked links change colour". Each selector here must
 * set a colour in some rule.
 */
const css = fs.readFileSync('styles/core/shared.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body,
}));

test('links in running text are coloured, visited or not', () => {
  for (const selector of ['.sub a', '.hint a', '.sub a:visited', '.hint a:visited']) {
    const coloured = rules.some((rule) => rule.selectors.includes(selector) && /(^|;|\s)color\s*:/.test(rule.body));
    assert.ok(coloured, `${selector} sets no colour in styles/core/shared.css`);
  }
});
