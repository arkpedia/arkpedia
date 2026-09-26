import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOperaBrowser } from '../../components/ui/PipWindow';

// Opera GX opens a Document Picture-in-Picture window that does not stay on top of the
// game, so /recruitment offers Opera a regular window and says why (kukki PR #73,
// c06157cb and 45f4962b). The browser test in tests/browser/core.spec.ts drives the page;
// this pins which browsers count as Opera.
const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test('Opera and Opera GX are recognised by their OPR/ token or their client-hint brand', () => {
  assert.equal(isOperaBrowser({ userAgent: `${chrome} OPR/114.0.0.0 (Edition GX)` }), true, 'Opera GX');
  assert.equal(isOperaBrowser({ userAgent: `${chrome} OPR/114.0.0.0` }), true, 'Opera');
  // A build that trims the user-agent string still names itself in its brands.
  assert.equal(isOperaBrowser({ userAgent: chrome, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Opera GX' }] } }), true);
  assert.equal(isOperaBrowser({ userAgent: chrome, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Opera' }] } }), true);
});

test('other Chromium browsers keep the always-on-top window', () => {
  assert.equal(isOperaBrowser({ userAgent: chrome, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] } }), false, 'Chrome');
  assert.equal(isOperaBrowser({ userAgent: `${chrome} Edg/130.0.0.0`, userAgentData: { brands: [{ brand: 'Microsoft Edge' }] } }), false, 'Edge');
  assert.equal(isOperaBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' }), false, 'Safari');
  // Only the token itself: a product that merely ends in "OPR" is not Opera.
  assert.equal(isOperaBrowser({ userAgent: `${chrome} FOOPR/1.0` }), false);
});
