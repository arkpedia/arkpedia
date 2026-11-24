import type { D1Database } from '@cloudflare/workers-types';
import type { PollId, PollSettings, PollSettingsUpdate } from './settings';

type Row = Omit<PollSettings, 'visible'> & { visible: number };
const fields = 'id,visible,results,closes_at AS closesAt,closed_placement AS closedPlacement,revision';
function setting(row: Row): PollSettings { return { ...row, visible: !!row.visible }; }

export async function readPollSettings(db: D1Database) {
  const { results } = await db.prepare(`SELECT ${fields} FROM poll_settings ORDER BY rowid`).all<Row>();
  return results.map(setting);
}
export async function readPollSetting(db: D1Database, id: PollId) {
  const row = await db.prepare(`SELECT ${fields} FROM poll_settings WHERE id=?`).bind(id).first<Row>();
  if (!row) throw Error('Poll settings unavailable.');
  return setting(row);
}
export async function savePollSetting(db: D1Database, s: PollSettingsUpdate, actor: string) {
  const row = await db.prepare(`UPDATE poll_settings SET visible=?,results=?,closes_at=?,closed_placement=COALESCE(?,closed_placement),editor=?,revision=revision+1
    WHERE id=? AND revision=? RETURNING ${fields}`).bind(+s.visible,s.results,s.closesAt,s.closedPlacement ?? null,actor,s.id,s.revision).first<Row>();
  return row && setting(row);
}

// Evaluate at the database write, including requests that started before a close or hide.
export function votingOpenSql(id: PollId) {
  return `EXISTS (SELECT 1 FROM poll_settings WHERE id='${id}' AND visible=1
    AND (closes_at IS NULL OR closes_at > unixepoch('subsec') * 1000))`;
}
