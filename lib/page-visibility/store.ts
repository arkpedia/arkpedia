import type { D1Database } from '@cloudflare/workers-types';
import { dashboardEnv } from '@/lib/dashboard/access';
import { isManagedPage, publicPageVisibility, type PageVisibilitySetting } from './settings';

const fields = 'id, mode, show_at AS showAt, hide_at AS hideAt, revision';

export async function readPageVisibility(db: D1Database) {
  const { results } = await db.prepare(`SELECT ${fields} FROM page_visibility ORDER BY id`).all<PageVisibilitySetting>();
  return results.filter(row => isManagedPage(row.id));
}

export function savePageVisibility(db: D1Database, setting: PageVisibilitySetting, actor: string) {
  return db.prepare(`UPDATE page_visibility SET mode=?, show_at=?, hide_at=?, editor=?, revision=revision+1
    WHERE id=? AND revision=? RETURNING ${fields}`)
    .bind(setting.mode, setting.showAt, setting.hideAt, actor, setting.id, setting.revision)
    .first<PageVisibilitySetting>();
}

export async function readPublicPageVisibility() {
  const db = dashboardEnv().ARKPEDIA_ACCOUNTS_DB;
  if (!db) return publicPageVisibility([], Date.now());
  const settings = await readPageVisibility(db).catch(() => []);
  return publicPageVisibility(settings, Date.now());
}
