// The site's front Worker (README.md): pages from the data centre's cache, everything else
// and every miss from the site Worker through the SITE service binding (wrangler.jsonc).
import { createEdge } from './edge.mjs';

const answer = createEdge();

export default {
  fetch(request, env, ctx) {
    return answer(request, { cache: caches.default, site: env.SITE, waitUntil: (promise) => ctx.waitUntil(promise) });
  },
};
