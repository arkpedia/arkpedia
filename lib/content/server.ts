import { contentPageClock, type PageClockField, type PageClockMoment } from './pageClock';
import { defaultContentRevalidate } from './revalidation';
import { REGIONAL_ROUTES, missingPageTables, pageTables } from './tables.mjs';
import { loadRelease, readPageProps } from './release';
import { operatorPageRoute } from '../operators/operatorPagePaths';
import type { GetStaticProps, GetStaticPropsContext, GetStaticPropsResult, Redirect } from 'next';
import { contentRoute } from './types';
import renamedRoutes from '../../config/renamed-routes.json';

/** Each renamed page's address, with the one it had (config/renamed-routes.json). */
const RENAMED_ROUTES: Record<string, string> = renamedRoutes.routes;

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

/**
 * What a page's own data builder returns. No `revalidate`: a page served from the
 * release never calls its builder, so an interval set there silently never reached
 * Next (/schedule's 1200 did nothing). Pass it as withContentPage's option. No clock
 * fields either: contentPageClock sets `now`/`buildDay` per request, and a builder
 * that read the clock would freeze the export's moment into the release.
 */
export type ContentPageBuilder<P> = (context: GetStaticPropsContext) => Promise<
  | { props: P | Omit<P, PageClockField> | Promise<P | Omit<P, PageClockField>>; revalidate?: never }
  | { notFound: true; revalidate?: never }
  | { redirect: Redirect; revalidate?: never }
>;

// Exports stay clock-free; every other path is a request and gets its moment.
const moment = (): PageClockMoment => process.env.ARKPEDIA_EXPORT_CONTENT === '1' ? { exporting: true } : { now: Date.now() };

export interface ContentPageOptions<P> {
  /** Runs on every request's props, the release's or the builder's (never in the export). */
  finalize?: (props: P) => Promise<P>;
  revalidate?: number;
  tables?: ContentTableLoaders;
  /**
   * Build the page with its own builder at runtime too (ISR on Vercel) while the live
   * release does not publish the route. Without it such a regeneration throws
   * "Published content is missing <route>", and Next keeps serving the page the deploy
   * prerendered until a release compiled by this code goes live: up to a day for a route
   * a deploy has just made a content route (/community-hub, 2026-09-26). Only for a static
   * route whose builder reads nothing but compiled-in modules: Vercel's function traces
   * leave data/ and public/ out of a content route (next.config.js), so a builder that
   * reads a data file fails there. scripts/tests/test-previous-release-props.ts runs each
   * route the previous release lacks this way, from a directory with no data/ in it.
   */
  bundledWhenUnpublished?: boolean;
}

/** Build and ISR use the same reader. No remote code or credentials are shipped. */
export function withContentPage<P extends object>(template: string, builder: ContentPageBuilder<P>, options: ContentPageOptions<P> = {}): GetStaticProps<P> {
  // The page and lib/content/tables.mjs must name the same tables: validate-release
  // checks the list, and the browser reads what the loaders attach. Thrown at module
  // load, so a mismatch fails the build and the export rather than a request.
  const loaders = { ...options.tables, ...(REGIONAL_ROUTES.includes(template) ? { 'regional-schedules': async () => (await import('../time/regionalServer')).regionalTable(template) } : {}) };
  const declared = [...pageTables(template)].sort().join(', ');
  if (Object.keys(loaders).sort().join(', ') !== declared) {
    throw new Error(`${template} must pass a table loader for exactly: ${declared || '(none)'} (lib/content/tables.mjs)`);
  }
  // A dynamic route the release lacks is a 404 (below), never the builder's page.
  if (options.bundledWhenUnpublished && template.includes('[')) {
    throw new Error(`${template}: bundledWhenUnpublished is for static routes only`);
  }
  const revalidate = () => process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : (options.revalidate ?? defaultContentRevalidate(template));
  const bundled = async (context: GetStaticPropsContext): Promise<GetStaticPropsResult<P>> => {
    const result = await builder(context);
    if (!('props' in result)) return result;
    if ('revalidate' in result) throw new Error(`${template}: set revalidate as a withContentPage option, not in the page data`);
    return { props: await result.props as P };
  };
  return async (context: GetStaticPropsContext): Promise<GetStaticPropsResult<P>> => {
    // Local source data is present while prerendering and in local development.
    // Vercel ISR functions intentionally exclude it from their file traces; at
    // runtime they must use the published content release instead.
    const bundledFallbackAvailable = context.revalidateReason === 'build'
      || process.env.VERCEL !== '1'
      || process.env.ARKPEDIA_CONTENT_DISABLED === '1';
    const loaded = await loadRelease();
    if (loaded) {
      const named = contentRoute(template, context.params);
      // A renamed page reads its old address until the live release has the new one
      // (config/renamed-routes.json).
      const formerly = RENAMED_ROUTES[named];
      const route = !loaded.manifest.pages[named] && formerly && loaded.manifest.pages[formerly] ? formerly : named;
      const resolved = operatorPageRoute(loaded.manifest.pages, route) ?? route;
      const file = loaded.manifest.pages[resolved];
      if (!file) {
        if (template.includes('[')) return { notFound: true, revalidate: process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : 60 };
        if (!bundledFallbackAvailable && !options.bundledWhenUnpublished) throw new Error(`Published content is missing ${route}`);
        const fallback = await bundled(context);
        if ('props' in fallback) fallback.props = await attachTables(template, contentPageClock(template, await fallback.props, moment()), loaders);
        if ('props' in fallback && options.finalize) fallback.props = await options.finalize(await fallback.props);
        return { ...fallback, revalidate: revalidate() };
      }
      try {
        const props = await readPageProps(loaded, route);
        if (!props) {
          if (template.includes('[')) return { notFound: true, revalidate: process.env.ARKPEDIA_CONTENT_TEST === '1' ? 1 : 60 };
          throw new Error('Published content page disappeared');
        }
        const currentProps = await attachTables(template, contentPageClock(template, { ...props, __contentRelease: loaded.context } as unknown as P, moment()), loaders, loaded.context.release);
        return { props: options.finalize ? await options.finalize(currentProps) : currentProps, revalidate: revalidate() };
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
    if ('props' in fallback) fallback.props = await attachTables(template, contentPageClock(template, await fallback.props, moment()), loaders);
    if ('props' in fallback && options.finalize && process.env.ARKPEDIA_EXPORT_CONTENT !== '1') fallback.props = await options.finalize(await fallback.props);
    return { ...fallback, revalidate: revalidate() };
  };
}
