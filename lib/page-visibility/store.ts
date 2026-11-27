import type { D1Database } from '@cloudflare/workers-types';
import { dashboardEnv } from '@/lib/dashboard/access';
import { managedPages, publicPageVisibility, type ManagedPage, type PageVisibilitySetting } from './settings';

const fields = 'id, mode, show_at AS showAt, hide_at AS hideAt, revision';

export async function readPageVisibility(db: D1Database) {
  const { results } = await db.prepare(`SELECT ${fields} FROM page_visibility ORDER BY id`).all<PageVisibilitySetting>();
  const saved = new Map(results.map(row => [row.id, row]));
  return (Object.keys(managedPages) as ManagedPage[]).map((id): PageVisibilitySetting =>
    saved.get(id) ?? { id, mode: 'unlisted', showAt: null, hideAt: null, revision: 0 });
}

export async function savePageVisibility(db: D1Database, setting: PageVisibilitySetting, actor: string) {
  const saved = await db.prepare(`UPDATE page_visibility SET mode=?, show_at=?, hide_at=?, editor=?, revision=revision+1
    WHERE id=? AND revision=? RETURNING ${fields}`)
    .bind(setting.mode, setting.showAt, setting.hideAt, actor, setting.id, setting.revision)
    .first<PageVisibilitySetting>();
  if (saved || setting.revision !== 0) return saved;
  // A newly managed page starts unlisted in code. The first edit creates its setting,
  // and a concurrent first edit still receives the normal revision conflict.
  return db.prepare(`INSERT INTO page_visibility (id, mode, show_at, hide_at, editor, revision)
    VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT (id) DO NOTHING RETURNING ${fields}`)
    .bind(setting.id, setting.mode, setting.showAt, setting.hideAt, actor)
    .first<PageVisibilitySetting>();
}

export async function readPublicPageVisibility() {
  const db = dashboardEnv().ARKPEDIA_ACCOUNTS_DB;
  if (!db) return publicPageVisibility([], Date.now());
  const settings = await readPageVisibility(db).catch(() => []);
  return publicPageVisibility(settings, Date.now());
}
