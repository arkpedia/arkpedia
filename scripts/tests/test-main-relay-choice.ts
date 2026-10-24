import test from 'node:test';
import assert from 'node:assert/strict';
import relay from '../../config/relay.json';
import { chooseRelayUrl } from '../../lib/account-import/relay';

test('only exact reviewed Cloudflare origins can select its relay', () => {
  for (const hostname of relay.cloudflare.hosts) {
    assert.equal(chooseRelayUrl({ hostname, search: '' }), relay.cloudflare.url);
    assert.equal(chooseRelayUrl({ hostname, search: '?relay=vps' }), relay.url);
    assert.equal(chooseRelayUrl({ hostname, search: '?relay=cloudflare' }, { ...relay, cloudflare: { ...relay.cloudflare, use: false } }), relay.cloudflare.url);
  }
  for (const hostname of ['www.arkpedia.net', 'arkpedia.net', 'arkpedia-dev.vercel.app', 'arbitrary.workers.dev', 'arkpedia-staging.cloudflare-1ff.workers.dev.attacker.example', 'localhost']) {
    assert.equal(chooseRelayUrl({ hostname, search: '?relay=cloudflare' }), relay.url, hostname);
  }
});
