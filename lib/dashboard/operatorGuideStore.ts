import type { D1Database } from '@cloudflare/workers-types';
import type { Operator } from '../operators/operatorTypes';
import { dashboardDatabase, dashboardEnv } from './access';
import { applyGuideEdits, type GuideEdit, type GuideValue } from './operatorGuide';

export async function readGuideEdits(db: D1Database, id: string): Promise<GuideEdit[]> {
  const { results } = await db.prepare('SELECT field, revision, value_json FROM operator_guide_edits WHERE operator_id = ?')
    .bind(id).all<{ field: string; revision: number; value_json: string | null }>();
  return results.map(row => ({ field: row.field, revision: row.revision, value: row.value_json ? JSON.parse(row.value_json) : null }));
}

export async function saveGuideEdit(db: D1Database, id: string, field: string, revision: number, value: GuideValue | null, actor: string) {
  const json = value === null ? null : JSON.stringify(value);
  const statement = revision === 0
    ? db.prepare('INSERT INTO operator_guide_edits (value_json, editor, updated_at, operator_id, field, revision) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT DO NOTHING')
      .bind(json, actor, new Date().toISOString(), id, field)
    : db.prepare('UPDATE operator_guide_edits SET value_json = ?, editor = ?, updated_at = ?, revision = revision + 1 WHERE operator_id = ? AND field = ? AND revision = ?')
      .bind(json, actor, new Date().toISOString(), id, field, revision);
  return (await statement.run()).meta.changes === 1;
}

export async function withOperatorGuides<P extends { operator: Operator }>(page: P): Promise<P> {
  const db = dashboardDatabase(dashboardEnv());
  if (!db || !page.operator.internalName) return page;
  const edits = await readGuideEdits(db, page.operator.internalName);
  return { ...page, operator: applyGuideEdits(page.operator, edits) };
}
