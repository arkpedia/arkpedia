import { createAssetDelivery } from './delivery.mjs';
const answer = createAssetDelivery();
export default { fetch(request, env, ctx) {
  return answer(request, { bucket: env.PUBLIC_ASSETS, cache: caches.default, waitUntil: promise => ctx.waitUntil(promise) });
} };
