import fs from 'fs';
import path from 'path';

/**
 * Tables the Worker reads from its own static files instead of compiling them into handler.mjs,
 * the one bundle every cold start loads (docs/development/cloudflare-workers.md). Each is copied
 * to public/_tables/ by scripts/build/ship-tables.mjs (generate:public), and OpenNext uploads
 * public/ as the Worker's static files, reachable through its ASSETS binding.
 *
 * Unlike readDataTable (lib/content/dataTable.ts), this keeps working at request time on the
 * Worker, where data/ is not on disk: a page builder's fallback (a static route the live release
 * lacks, or a release that cannot be read) still gets the table. regional-schedules.json was
 * 3.45 MB of the 20.48 MB handler.mjs on 2026-10-30, the largest part by far.
 */
export const SHIPPED_TABLES = ['event-rewards.json','regional-schedules.json','community-operator-catalogue.json','community-stage-catalogue.json','community-poll-catalogue.json','account-catalogue.json','tier-list-catalogue.json','pull-sources.json','headhunting_banners.json','operator-translations.json','combat-keywords.json','base-skill-glossary.json','color-palettes.json'] as const;
export type ShippedTable = typeof SHIPPED_TABLES[number];

interface AssetsBinding { fetch(request: Request): Promise<Response> }

/** data/<file> from disk where it is (prerendering, the content export, local dev), else from
 *  the Worker's static files. `assets` stands in for the binding in tests. */
export async function readShippedTable<T>(file: ShippedTable, { root = process.cwd(), assets }: { root?: string; assets?: AssetsBinding } = {}): Promise<T> {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8')) as T;
  } catch {
    // Not on disk: the Worker answering a request.
  }
  return readAssetJson<T>(`_tables/${file}`, assets);
}

/** CCB reads its catalogue manifest on both the build host and cold Workers. */
export async function readCcbManifest<T>({ root = process.cwd(), assets }: { root?: string; assets?: AssetsBinding } = {}): Promise<T> {
  const file = '_ccb/manifest.json';
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'public', file), 'utf8')) as T;
  } catch { /* Cold Workers fetch the same snapshot from their static assets. */ }
  return readAssetJson<T>(file, assets);
}

async function readAssetJson<T>(file: string, assets?: AssetsBinding): Promise<T> {
  const binding = assets ?? ((await (await import('@opennextjs/cloudflare')).getCloudflareContext({ async: true })).env as unknown as { ASSETS: AssetsBinding }).ASSETS;
  const response = await binding.fetch(new Request(`https://assets.local/${file}`));
  if (!response.ok) throw new Error(`${file}: the Worker's static files answered HTTP ${response.status}`);
  return await response.json() as T;
}
