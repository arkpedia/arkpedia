import { pageFilePath, isContentPagePath, contentFileUrlPath } from './pagePaths.mjs';
import { readChannelPointer } from './pointer.mjs';
import { operatorPageAcceptsName, operatorPageRoute } from '../operators/operatorPagePaths';
import { createHash } from 'node:crypto';
import { fetchAsset } from '../assets/githubRetry.mjs';
import { CONTENT_SCHEMA, type ContentFile, type ContentManifest, type ContentPointer, type ContentRelease } from './types';
import { deliveryBaseUrl, DELIVERY_PREFIX } from './r2Delivery.mjs';
import { assetUrl } from '../assets/assetUrl';

/*
 * The site's published content release: the channel's pointer, the manifest it names and each
 * page's props, every file checked against its digest. withContentPage (./server.ts) serves pages
 * from it; the API routes read it here, so their bundle leaves withContentPage's tables out.
 */

const DEFAULT_ORIGIN = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const REFRESH_MS = 60_000;
const SHA = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
type Loaded = { manifest: ContentManifest; context: ContentRelease };
let cached: Loaded | undefined;
let checkedAt = 0;
let pending: Promise<Loaded | undefined> | undefined;
const pageCache = new Map<string, Record<string, unknown>>();

export async function readPageProps(loaded: Loaded, route: string): Promise<Record<string, unknown> | null> {
  const resolved = operatorPageRoute(loaded.manifest.pages, route) ?? route;
  const file = loaded.manifest.pages[resolved];
  if (!file || !validFile(resolved, file)) return null;
  const cacheKey = `${loaded.context.release}:${resolved}`;
  let props = pageCache.get(cacheKey);
  if (!props) {
    const bytes = await read(`${loaded.context.baseUrl}/${contentFileUrlPath(file.path)}`, file.bytes);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('Content page checksum mismatch');
    const parsed = JSON.parse(bytes.toString()) as { props?: Record<string, unknown> };
    if (!parsed.props || Array.isArray(parsed.props) || typeof parsed.props !== 'object') throw new Error('Invalid content page');
    props = parsed.props;
    if (pageCache.size >= 64) pageCache.delete(pageCache.keys().next().value!);
    pageCache.set(cacheKey, props);
  }
  return resolved === route || operatorPageAcceptsName(props, route) ? props : null;
}

/** Read one verified page from the same published release used by ISR. */
export async function readPublishedContentPageProps<P extends object>(route: string): Promise<P | null> {
  const loaded = await loadRelease();
  return loaded ? await readPageProps(loaded, route) as P | null : null;
}

/** The pointer branch this site reads (scripts/content/channel.mjs): live, or dev-live on
 *  arkpedia-dev, whose releases dev's code compiles. Inlined at build (next.config.js env)
 *  from what Deploy sets for the deployment's branch. The rule is content-channel.cjs's
 *  contentPointer (the same pattern, the same live default; test-content-channel.ts holds the
 *  two to it), written out here because importing that file would pull config/*.json into the
 *  server bundle. */
export function contentChannel(): string {
  const value = process.env.ARKPEDIA_CONTENT_CHANNEL || 'live';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error(`Invalid content channel: ${value}`);
  return value;
}

/** The channel's pointer, or live's while the channel has none yet (lib/content/pointer.mjs). */
function readPointer(root: string): Promise<Buffer> {
  return readChannelPointer({ root, channel: contentChannel(), read: url => read(url, 2048), warn: message => console.warn(`[content] ${message}`) });
}

function origin(): string {
  const value = process.env.ARKPEDIA_CONTENT_URL || DEFAULT_ORIGIN;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && !(process.env.ARKPEDIA_CONTENT_TEST === '1' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) {
    throw new Error('Content origin must use HTTPS');
  }
  return value.replace(/\/$/, '');
}

/** Retained server-only pilot override; canonical deployments use the public asset reader. */
function pilotOrigin(): string | undefined {
  const value = process.env.ARKPEDIA_CONTENT_PILOT_ORIGIN;
  if (!value) return undefined;
  if (process.env.ARKPEDIA_DEPLOYMENT_ROLE !== 'staging') throw new Error('R2 delivery pilot requires the staging deployment role');
  const parsed = new URL(value);
  const localTest = process.env.ARKPEDIA_CONTENT_TEST === '1' && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localTest || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('R2 delivery pilot requires a bare HTTPS origin');
  }
  return parsed.origin;
}

async function read(url: string, maxBytes: number): Promise<Buffer> {
  // GitHub's raw origin sometimes answers 404 for a file it has, and its CDN keeps that answer
  // for minutes: fetchAsset asks again at other encodings of the address (lib/assets/
  // githubRetry.mjs), all inside the one 10-second budget. Without it one false 404 was a page
  // regenerated from the bundled snapshot or, for a channel's pointer, live's release instead
  // of the channel's own.
  const response = await fetchAsset(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  // The status rides on the error: a missing channel pointer (404) falls back to live's.
  if (!response.ok) throw Object.assign(new Error(`Content HTTP ${response.status}: ${url}`), { status: response.status });
  // Content-Length counts the bytes on the wire, gzip's when the origin compressed them, and gzip
  // makes a tiny file bigger: /search's 12-byte {"props":{}} came as 32, so its every regeneration
  // threw and Vercel kept the deploy's build. The limit is on the decoded bytes the loop below
  // counts; the header only answers early for a body sent as it is.
  if (!response.headers.get('content-encoding') && Number(response.headers.get('content-length')) > maxBytes) throw new Error('Content response too large');
  if (!response.body) throw new Error('Empty content response');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Content response too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function validFile(route: string, file: ContentFile) {
  return file && isContentPagePath(file.path) && file.path === pageFilePath(route) && SHA.test(file.sha256)
    && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 25_000_000;
}

export async function loadRelease(): Promise<Loaded | undefined> {
  if (process.env.ARKPEDIA_CONTENT_DISABLED === '1' || process.env.ARKPEDIA_EXPORT_CONTENT === '1') return undefined;
  if (Date.now() - checkedAt < (process.env.ARKPEDIA_CONTENT_TEST === '1' ? 0 : REFRESH_MS)) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const pilot = pilotOrigin();
      const root = pilot ?? origin();
      // No channel-to-live fallback for a candidate pilot: its own pointer must exist.
      const pointerBytes = pilot ? await read(`${pilot}${DELIVERY_PREFIX}current.json`, 2048) : await readPointer(root);
      const pointer = JSON.parse(pointerBytes.toString()) as ContentPointer;
      if (pointer.schema !== CONTENT_SCHEMA || !SHA.test(pointer.release) || !GIT_SHA.test(pointer.revision) || !SHA.test(pointer.manifestSha256)) throw new Error('Unsupported content pointer');
      const baseUrl = pilot ? deliveryBaseUrl(pilot, pointer, { allowLocalHttp: process.env.ARKPEDIA_CONTENT_TEST === '1' })
        : root === DEFAULT_ORIGIN ? assetUrl('arkpedia-data', pointer.revision, 'release') : `${root}/${pointer.revision}/release`;
      if (cached?.context.release === pointer.release && cached.context.baseUrl === baseUrl) return cached;
      const bytes = await read(`${baseUrl}/manifest.json`, 5_000_000);
      if (digest(bytes) !== pointer.manifestSha256) throw new Error('Content manifest checksum mismatch');
      const manifest = JSON.parse(bytes.toString()) as ContentManifest;
      if (manifest.schema !== CONTENT_SCHEMA || manifest.release !== pointer.release || !manifest.pages || !manifest.files || !manifest.assets
        || !Object.values(manifest.assets).every(value => typeof value === 'string' && GIT_SHA.test(value))
        || !manifest.assets['arkpedia-image-assets'] || !manifest.assets['arkpedia-skin-assets']
        || !Object.entries(manifest.pages).every(([route, file]) => validFile(route, file))) throw new Error('Invalid content manifest');
      cached = { manifest, context: { release: pointer.release, baseUrl, assets: manifest.assets } };
      pageCache.clear();
      return cached;
    } catch (error) {
      console.warn('[content] Keeping last available release:', error instanceof Error ? error.message : error);
      return cached;
    } finally { checkedAt = Date.now(); pending = undefined; }
  })();
  return pending;
}
