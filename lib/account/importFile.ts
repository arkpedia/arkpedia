/**
 * What a file (or pasted text) handed to the Import / export dialog is, tried in the order
 * whose signatures are exact:
 *
 *   1. an Arkpedia backup (lib/account/backup.ts): everything the site keeps;
 *   2. a Pull Planner plan, as its old Export wrote it (lib/pulls/plan.ts);
 *   3. what the Operator Planner reads (lib/planner/transfer.ts): its own bundle and the two
 *      bare maps it used to write, Krooster's CSV and JSON, Penguin Stats' and ark-nights'.
 *
 * A file that says what it is and then fails its checks is refused with a reason rather than
 * passed to the next reader: a broken backup must not be read as something else.
 */
import { parseTransfer, type ParsedTransfer } from '@/lib/planner/transfer';
import type { ImportAliases } from '@/lib/planner/foreignImport';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { MAX_PLAN_FILE_SIZE, parsePullPlan, type SavedPullPlan } from '@/lib/pulls/plan';
import { parseBackup, type ParsedBackup } from './backup';

export type ImportedFile =
  | { kind: 'backup'; backup: ParsedBackup }
  | { kind: 'pull-plan'; plan: SavedPullPlan }
  | { kind: 'planner'; parsed: ParsedTransfer }
  | { kind: 'refused'; reason: string };

export function readImportFile(text: string, aliases: ImportAliases): ImportedFile {
  if (text.length > MAX_IMPORT_BYTES) return { kind: 'refused', reason: `That is ${(text.length / 1048576).toFixed(1)} MB, far larger than any Arkpedia file, so it was not read.` };
  const backup = parseBackup(text);
  if (backup === 'invalid') return { kind: 'refused', reason: 'That backup is damaged or from a newer Arkpedia, so nothing was changed.' };
  if (backup) return { kind: 'backup', backup };
  if (text.length <= MAX_PLAN_FILE_SIZE && looksLikePullPlan(text)) {
    try {
      return { kind: 'pull-plan', plan: parsePullPlan(text) };
    } catch (error) {
      return { kind: 'refused', reason: error instanceof Error ? error.message : 'That pull plan could not be read.' };
    }
  }
  const parsed = parseTransfer(text, aliases);
  if (parsed) return { kind: 'planner', parsed };
  return { kind: 'refused', reason: 'That is not a file this can read: nothing was changed.' };
}

/* The pull plan has no `kind`; its own fields say what it is. */
function looksLikePullPlan(text: string): boolean {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return !!value && typeof value === 'object' && value.version === 1 && 'orundum' in value && 'goals' in value;
  } catch {
    return false;
  }
}
