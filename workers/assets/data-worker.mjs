import { createAssetDelivery } from './delivery.mjs';

export function createDataDelivery() {
  const answer = createAssetDelivery();
  return async (request, dependencies) => {
    let path;
    try { path = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('Invalid data path', { status: 400, headers: { 'cache-control': 'no-store' } }); }
    if (!path.startsWith('/arkpedia/arkpedia-data/') && !path.startsWith('/__ready/arkpedia-data/')) {
      return new Response('Unknown data asset', { status: 404, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
    }
    const result = await answer(request, dependencies);
    const response = new Response(result.body, result);
    response.headers.set('x-arkpedia-storage', 'arkpedia-public-assets-direct');
    response.headers.set('access-control-expose-headers', 'Content-Length, Content-Range, ETag, X-Arkpedia-Assets, X-Arkpedia-Storage');
    return response;
  };
}
const answer = createDataDelivery();
const worker = { fetch(request, env, ctx) {
  return answer(request, { bucket: env.PUBLIC_ASSETS, cache: caches.default, waitUntil: promise => ctx.waitUntil(promise) });
} };
export default worker;
