import fs from 'fs';
import path from 'path';

/**
 * A data/ table read from disk, in place of the import that compiles it into the server code.
 * For the Worker's build (ARKPEDIA_WORKER, next.config.js), whose one bundle every cold start
 * loads (docs/development/cloudflare-workers.md), and only for a table nothing on the Worker
 * reads at request time: a builder that cannot run there anyway, or a backfill no release it
 * reads needs. While Next prerenders, data/ is on disk.
 *
 * Test the constant at the call site, with the import in the other branch, so webpack leaves
 * the import out of the Worker's build (a callback holding the import would keep it in):
 *
 *   process.env.ARKPEDIA_WORKER === '1' ? readDataTable<T>('chibi-art.json') : (await import('@/data/chibi-art.json')).default
 */
export function readDataTable<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8')) as T;
}
