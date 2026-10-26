// The site's front Worker (README.md): pages from the data centre's cache, everything else
// and every miss from the site Worker through the SITE service binding (wrangler.jsonc).
import { createEdge } from './edge.mjs';
import { domainResponse } from './domains.mjs';

const answer = createEdge();

export default {
  async fetch(request, env, ctx) {
    const domain = await domainResponse(request);
    if (domain) return domain;
    return answer(request, { cache: caches.default, site: env.SITE, waitUntil: (promise) => ctx.waitUntil(promise) });
  },
};
