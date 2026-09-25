import { contentPageClock } from './pageClock';
import { pageFilePath, isContentPagePath, contentFileUrlPath } from './pagePaths.mjs';
import { missingPageTables, pageTables } from './tables.mjs';
import { createHash } from 'node:crypto';
import type { GetStaticProps, GetStaticPropsContext, GetStaticPropsResult } from 'next';
import { CONTENT_SCHEMA, contentRoute, type ContentFile, type ContentManifest, type ContentPointer, type ContentRelease } from './types';

const DEFAULT_ORIGIN = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const REFRESH_MS = 60_000;
const SHA = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
type Loaded = { manifest: ContentManifest; context: ContentRelease };
let cached: Loaded | undefined;
let checkedAt = 0;
let pending: Promise<Loaded | undefined> | undefined;
const pageCache = new Map<string, Record<string, unknown>>();

async function readPageProps(loaded: Loaded, route: string): Promise<Record<string, unknown> | null> {
  const file = loaded.manifest.pages[route];
  if (!file || !validFile(route, file)) return null;
  const cacheKey = `${loaded.context.release}:${route}`;
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
  return props;
}

/** Read one verified page from the same published release used by ISR. */
export async function readPublishedContentPageProps<P extends object>(route: string): Promise<P | null> {
  const loaded = await loadRelease();
  return loaded ? await readPageProps(loaded, route) as P | null : null;
}

function origin(): string {
  const value = process.env.ARKPEDIA_CONTENT_URL || DEFAULT_ORIGIN;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && !(process.env.ARKPEDIA_CONTENT_TEST === '1' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) {
    throw new Error('Content origin must use HTTPS');
  }
  return value.replace(/\/$/, '');
}

async function read(url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Content HTTP ${response.status}: ${url}`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Content response too large');
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

async function loadRelease(): Promise<Loaded | undefined> {
  if (process.env.ARKPEDIA_CONTENT_DISABLED === '1' || process.env.ARKPEDIA_EXPORT_CONTENT === '1') return undefined;
  if (Date.now() - checkedAt < (process.env.ARKPEDIA_CONTENT_TEST === '1' ? 0 : REFRESH_MS)) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const root = origin();
      const pointer = JSON.parse((await read(`${root}/live/current.json`, 2048)).toString()) as ContentPointer;
      if (pointer.schema !== CONTENT_SCHEMA || !SHA.test(pointer.release) || !GIT_SHA.test(pointer.revision) || !SHA.test(pointer.manifestSha256)) throw new Error('Unsupported content pointer');
      if (cached?.context.release === pointer.release) return cached;
      const baseUrl = `${root}/${pointer.revision}/release`;
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

/** One loader per table a route declares in lib/content/tables.mjs, each importing its
 *  data file. Written inside the getStaticProps call, so Next drops them from the
 *  browser build along with it: the tables reach the browser only through props. */
export type ContentTableLoaders = Record<string, () => Promise<unknown>>;

const warnedTables = new Set<string>();
/** Give props every table the route declares, without touching a cached payload. A
 *  table the props already carry (the release's copy) always wins. */
async function attachTables<P extends object>(template: string, props: P, loaders: ContentTableLoaders, release?: string): Promise<P> {
  const missing = missingPageTables(template, props);
  if (!missing.length) return props;
  if (release) {
    // A release exported before these joined the route's tables. The next content run
    // re-exports every page (the generator commit is part of the release id), and
    // validate-release refuses a release without them, so only an older one lands here.
    const key = `${release}:${template}`;
    if (!warnedTables.has(key)) { warnedTables.add(key); console.warn(`[content] Release ${release.slice(0, 12)} predates ${missing.join(', ')} on ${template}; using this deployment's copy.`); }
  }
  const tables = { ...(props as { __contentTables?: Record<string, unknown> }).__contentTables };
  for (const name of missing) tables[name] = await loaders[name]();
  return { ...props, __contentTables: tables };
}

/** Build and ISR use the same reader. No remote code or credentials are shipped. */
export function withContentPage<P extends object>(template: string, bundled: GetStaticProps<P>, options: { finalize?: (props: P) => Promise<P>; revalidate?: number; tables?: ContentTableLoaders } = {}): GetStaticProps<P> {
  // The page and lib/content/tables.mjs must name the same tables: validate-release
  // checks the list, and the browser reads what the loaders attach. Thrown at module
  // load, so a mismatch fails the build and the export rather than a request.
  const loaders = options.tables ?? {};
  const declared = [...pageTables(template)].sort().join(', ');
  if (Object.keys(loaders).sort().join(', ') !== declared) {
    throw new Error(`${template} must pass a table loader for exactly: ${declared || '(none)'} (lib/content/tables.mjs)`);
  }
  return async (context: GetStaticPropsContext): Promise<GetStaticPropsResult<P>> => {
    // Local source data is present while prerendering and in local development.
    // Vercel ISR functions intentionally exclude it from their file traces; at
    // runtime they must use the published content release instead.
    const bundledFallbackAvailable = context.revalidateReason === 'build'
      || process.env.VERCEL !== '1'
      || process.env.ARKPEDIA_CONTENT_DISABLED === '1';
    const loaded = await loadRelease();
    if (loaded) {
      const route = contentRoute(template, context.params);
      const file = loaded.manifest.pages[route];
      if (!file) {
        if (template.includes('[')) return { notFound: true, revalidate: process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : 60 };
        if (!bundledFallbackAvailable) throw new Error(`Published content is missing ${route}`);
        const fallback = await bundled(context);
        if ('props' in fallback) fallback.props = await attachTables(template, contentPageClock(template, await fallback.props), loaders);
        if ('props' in fallback && options.finalize) fallback.props = await options.finalize(await fallback.props);
        return { ...fallback, revalidate: options.revalidate ?? 60 };
      }
      try {
        const props = await readPageProps(loaded, route);
        if (!props) throw new Error('Published content page disappeared');
        const currentProps = await attachTables(template, contentPageClock(template, { ...props, __contentRelease: loaded.context } as unknown as P), loaders, loaded.context.release);
        return { props: options.finalize ? await options.finalize(currentProps) : currentProps, revalidate: process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : (options.revalidate ?? 60) };
      } catch (error) {
        // An ISR failure preserves Next's previous valid page. A cold request can
        // use the shipped snapshot; existing pages must not be replaced by stale data.
        if (context.revalidateReason === 'stale' || context.revalidateReason === 'on-demand') throw error;
        console.warn('[content] Using bundled page:', error instanceof Error ? error.message : error);
      }
    }
    if (!bundledFallbackAvailable) throw new Error(`Published content is unavailable for ${contentRoute(template, context.params)}`);
    const fallback = await bundled(context);
    // The content export takes this path too, so this is where a release gets its tables.
    if ('props' in fallback) fallback.props = await attachTables(template, contentPageClock(template, await fallback.props, process.env.ARKPEDIA_EXPORT_CONTENT === '1'), loaders);
    if ('props' in fallback && options.finalize && process.env.ARKPEDIA_EXPORT_CONTENT !== '1') fallback.props = await options.finalize(await fallback.props);
    return { ...fallback, revalidate: process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : (options.revalidate ?? 60) };
  };
}
