import type { D1Database } from '@cloudflare/workers-types';
import type { ReleaseCandidate, ReleaseEntry } from './types';
import type { UpdateContent } from '@/lib/site-updates/types';

const fields = 'source, base, fingerprint, pull_request AS pullRequest, title, paths, note, state, target, revision';
type Row = Omit<ReleaseEntry, 'paths' | 'note'> & { paths: string; note: string | null };

function decode(row: Row): ReleaseEntry {
  return { ...row, paths: JSON.parse(row.paths), note: row.note === null ? null : JSON.parse(row.note) };
}

export function releaseStore(db: D1Database) {
  return {
    async list() {
      const { results } = await db.prepare(`SELECT ${fields} FROM release_queue
        ORDER BY state = 'publishing' DESC, updated_at DESC, source LIMIT 50`).all<Row>();
      return results.map(decode);
    },
    async read(source: string) {
      const row = await db.prepare(`SELECT ${fields} FROM release_queue WHERE source = ?`).bind(source).first<Row>();
      return row ? decode(row) : null;
    },
    async queue(candidate: ReleaseCandidate, actor: string) {
      return db.prepare(`INSERT INTO release_queue (source, base, fingerprint, pull_request, title, paths, state, updated_at, actor)
        VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?) ON CONFLICT(source) DO NOTHING RETURNING source`)
        .bind(candidate.source, candidate.base, candidate.fingerprint, candidate.pullRequest, candidate.title,
          JSON.stringify(candidate.paths), Date.now(), actor).first();
    },
    async saveNote(entry: ReleaseEntry, note: UpdateContent | null, actor: string) {
      return db.prepare(`UPDATE release_queue SET note = ?, updated_at = ?, actor = ?, revision = revision + 1
        WHERE source = ? AND state = 'queued' AND revision = ? RETURNING source`)
        .bind(note && JSON.stringify(note), Date.now(), actor, entry.source, entry.revision).first();
    },
    async start(entry: ReleaseEntry, target: string, actor: string) {
      try {
        return await db.prepare(`UPDATE release_queue SET state = 'publishing', target = ?, updated_at = ?, actor = ?, revision = revision + 1
          WHERE source = ? AND state = 'queued' AND revision = ? RETURNING source`)
          .bind(target, Date.now(), actor, entry.source, entry.revision).first();
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed: release_queue.state/.test(error.message)) return null;
        throw error;
      }
    },
    async needsReview(entry: ReleaseEntry) {
      return db.prepare(`UPDATE release_queue SET state = 'needs_review', updated_at = ?, revision = revision + 1
        WHERE source = ? AND target = ? AND state = 'publishing' AND revision = ? RETURNING source`)
        .bind(Date.now(), entry.source, entry.target, entry.revision).first();
    },
    async returnToQueue(entry: ReleaseEntry) {
      return db.prepare(`UPDATE release_queue SET state = 'queued', target = NULL, updated_at = ?, revision = revision + 1
        WHERE source = ? AND target = ? AND state = 'publishing' AND revision = ? RETURNING source`)
        .bind(Date.now(), entry.source, entry.target, entry.revision).first();
    },
    async finish(entry: ReleaseEntry) {
      const now = Date.now();
      // The announcement and its release transition commit together. A second
      // verifier sees no publishing row, so it cannot republish the note.
      await db.batch([
        db.prepare(`INSERT INTO site_updates (id, payload, major, revision, published_at, updated_at, actor)
          SELECT 'release-' || source, note, json_extract(note, '$.major'), 1, ?, ?, actor FROM release_queue
          WHERE source = ? AND target = ? AND state = 'publishing' AND note IS NOT NULL`)
          .bind(now, now, entry.source, entry.target),
        db.prepare(`UPDATE release_queue SET state = 'published', updated_at = ?, revision = revision + 1
          WHERE source = ? AND target = ? AND state = 'publishing'`)
          .bind(now, entry.source, entry.target),
      ]);
    },
  };
}

export type ReleaseStore = ReturnType<typeof releaseStore>;
