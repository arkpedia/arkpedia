import { useState } from 'react';
import GameSignIn from '@/components/account-import/GameSignIn';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { SERVER_IDS, SERVERS, type ServerId } from '@/lib/account-import/yostar';
import { readSavedLogin } from '@/lib/account-import/savedLogin';
import { storedAccount } from '@/lib/account/accountStore';
import { siteServerNow } from '@/lib/time/siteServer';
import ImportDialog from '@/components/account/ImportDialog';
import { useReleaseTable } from '@/lib/content/context';
import { depotNames, type MaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { unheldSummary, type ImportAliases } from '@/lib/planner/foreignImport';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { loadFromFile } from '@/lib/planner/fileTransfer';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { storePlannerTransfer } from '@/lib/planner/storeTransfer';
import { PULL_PLAN_KEY, type SavedPullPlan } from '@/lib/pulls/plan';
import { writePastProgress } from '@/lib/pulls/pastProgress';
import { importGameAccount, type ImportResult } from '@/lib/account/importAccount';
import type { PullRead } from '@/lib/account/pulls';
import { isResettingBrowserData, resetBrowserData } from '@/lib/account/resetData';
import { applyBackup, formatBackup, type ParsedBackup } from '@/lib/account/backup';
import { readImportFile } from '@/lib/account/importFile';

/** "412 operators, 375 skins, 77 materials, 1,840 stages cleared and your profile". */
function importedSummary(result: ImportResult): string {
  const n = (count: number, one: string, many: string) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
  return [n(result.operators, 'operator', 'operators'), n(result.record.skins.length, 'skin', 'skins'), n(result.materials, 'material', 'materials'),
    n(result.record.cleared.length, 'stage cleared', 'stages cleared')].join(', ') + (result.record.profile ? ' and your profile' : '');
}

/** What came of the pull history: how many this import read, or why none. */
function pullsSummary(read: PullRead): string {
  if (!read.rows) return ` Your pull history could not be read (${read.error ?? 'no reason given'}); the rest was imported.`;
  return ` ${read.rows.length.toLocaleString('en-US')} ${read.rows.length === 1 ? 'pull' : 'pulls'} from your headhunting history.`;
}

/*
 * Import / export: the one dialog for everything the site keeps of the reader, on the Account
 * page only (the planners link there: components/account/DataLink). From the game
 * (components/account-import/GameSignIn); from a file or pasted text, whatever
 * lib/account/importFile reads; an export of all of it (lib/account/backup); and Forget everything.
 * A file is written to storage, which its page reads when it next loads. The page must carry
 * the three tables it reads (lib/content/tables.mjs).
 */
export default function DataDialog({ onClose }: { onClose: () => void }) {
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const aliases = useReleaseTable<ImportAliases>('import-aliases');
  const catalogue = useReleaseTable<MaterialCatalogue>('material-catalogue');
  const [result, setResult] = useState<{ imported: ImportResult; pulls: PullRead } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [text, setText] = useState('');
  // The dialog opens on a click, after hydration, so storage can be read for its first render:
  // the remembered sign-in's server, else the site's (the nav's choice, else the account's).
  const [server, setServer] = useState<ServerId>(() => readSavedLogin()?.server ?? siteServerNow());

  function onAccount(user: Record<string, any>, pulls: PullRead, from: ServerId) {
    if (isResettingBrowserData()) return;
    setResult({ imported: importGameAccount(user, { map, aliases, depotNames: depotNames(catalogue) }, pulls, from), pulls });
  }

  function forget() {
    if (!window.confirm('Forget all Arkpedia data saved in this browser? This removes every account and sign-in, planner edits, story progress, music playlists and preferences. Export everything first if you want a backup.')) return;
    try { resetBrowserData(); }
    catch { setNote('This browser could not clear all saved data. Check its site-data settings.'); }
  }

  function restore(backup: ParsedBackup) {
    if (isResettingBrowserData()) return;
    try {
      applyBackup(backup);
    } catch {
      setNote('This browser would not store the backup, so nothing was changed.');
      return;
    }
    // In place, with no reload: a new document would end the music. applyBackup tells
    // everything open here, the app shell's player included, through each store's event,
    // and every other page reads its stores when it opens (lib/account/backup.ts).
    const what = backup.stores.map((store) => store.label);
    setNote(`Restored ${what.length ? what.join(', ') : 'nothing (the backup is empty)'}${backup.savedAt ? `, from a backup of ${backup.savedAt.slice(0, 10)}` : ''}.`);
  }
  function applyText(input: string, source: string) {
    if (isResettingBrowserData()) return;
    const file = readImportFile(input, aliases);
    if (file.kind === 'refused') { setNote(`${file.reason} (${source})`); return; }
    if (file.kind === 'backup') { restore(file.backup); return; }
    if (file.kind === 'pull-plan') {
      /* The file's resources and ticks stand over the current account import's: marked as
         already filled from it (walletFrom, ticksFrom), and the ticks go to their own store
         (lib/pulls/pastProgress.ts), which the Pull Planner and the OP Tracker read. */
      const at = storedAccount()?.importedAt ?? '';
      const plan: SavedPullPlan = { ...file.plan, ...(at ? { walletFrom: at, ticksFrom: at } : {}) };
      window.localStorage.setItem(PULL_PLAN_KEY, JSON.stringify(plan));
      writePastProgress({ doneKeys: plan.doneKeys, doneEvents: plan.doneEvents, annihilationDone: plan.annihilationDone, ticksFrom: plan.ticksFrom ?? '' });
      setNote(`Loaded the pull plan from ${source}. The Pull Planner opens with it.`);
      return;
    }
    setNote(storePlannerTransfer(file.parsed, depotNames(catalogue)));
  }

  async function exportAll(): Promise<void> {
    setExporting(true);
    try {
      const { exportDataArchive } = await import('@/lib/account/exportFiles');
      const now = new Date();
      const bytes = exportDataArchive(window.localStorage, now);
      downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `arkpedia-data-${now.toISOString().slice(0, 10)}.zip`);
      setNote('Exported player data, music playlists and story progress as three JSON files in one ZIP.');
    } catch (error) { setNote(error instanceof Error ? error.message : 'Your data could not be exported.'); }
    finally { setExporting(false); }
  }

  return (
    <ImportDialog title="Import / export" className="data-dialog" onClose={onClose}>
      <div className="data-dialog-body">
      <section className="data-dialog-part" aria-labelledby="data-game">
        <h3 id="data-game">From the game</h3>
        <p className="import-copy">
          Import data directly from your Arknights account (Global, Japan or Korea). Your login is sent encrypted and is never
          read by Arkpedia itself; Arkpedia only receives your raw account data. No login related information is
          kept on our servers. Everything that is persistent on your browser is saved to your browser locally.
        </p>
        <p className="hint import-note">
          Importing replaces your operators, depot and account, and kicks you out of the game if you are logged in.
        </p>
        {/* A sign-in is one server's: a code Yostar sent for one is no use on another, so each
            server's sign-in is its own (key). */}
        <SegmentedControl label="Server" className="import-server" value={server} onChange={setServer}
          options={SERVER_IDS.map((id) => ({ value: id, label: SERVERS[id].label }))} />
        <GameSignIn key={server} server={server} idPrefix="data" onAccount={onAccount} onForget={forget} />
        {result && (
          <p className="hint import-note" role="status">
            Imported: {importedSummary(result.imported)}.{pullsSummary(result.pulls)}{unheldSummary(result.imported.unknown)}
          </p>
        )}
      </section>

      <section className="data-dialog-part" aria-labelledby="data-file">
        <h3 id="data-file">From a file</h3>
        <div className="data-dialog-acts">
          <button type="button" className="ghost btn-sm" onClick={async () => {
            const opened = await loadFromFile({ archives: true });
            if (!opened) { setNote('Nothing loaded.'); return; }
            if (opened.tooLarge) { setNote(`${opened.name} is far larger than any Arkpedia file, so it was not read.`); return; }
            if (opened.bytes) {
              try { const { parseDataArchive } = await import('@/lib/account/exportFiles'); restore(parseDataArchive(opened.bytes)); }
              catch (error) { setNote(error instanceof Error ? error.message : 'That archive could not be read.'); }
            } else applyText(opened.text, opened.name);
          }}>Import file</button>
        </div>
        <p className="hint">
          An Arkpedia ZIP restores its three data files. Story and music JSON files and older backups are also supported. Also read: an older Operator Planner or Pull Planner
          export, and a Krooster CSV, Penguin Stats JSON or ark-nights file (these carry your depot only).
        </p>
        <details className="data-dialog-paste">
          <summary>Paste / copy as text</summary>
          <textarea className="planner-depot-text" rows={4} aria-label="Arkpedia data" placeholder="Paste a backup or an export…"
            value={text} onChange={(event) => { setText(event.target.value); setNote(null); }} />
          <div className="data-dialog-acts">
            <button type="button" className="ghost btn-sm" onClick={() => applyText(text, 'the box')} disabled={!text.trim()}>Import text</button>
            <button type="button" className="ghost btn-sm" onClick={() => { setText(formatBackup(window.localStorage)); setNote('The backup is in the box, ready to copy.'); }}>Get backup text</button>
          </div>
        </details>
      </section>

      <section className="data-dialog-part" aria-labelledby="data-export">
        <h3 id="data-export">Export</h3>
        <div className="data-dialog-acts">
          <button type="button" className="primary btn-sm" disabled={exporting} onClick={() => { void exportAll(); }}>Export everything</button>
        </div>
        <p className="hint">
          One ZIP with three JSON files: player data (your account and planners), music playlists and favourites,
          and story progress. These are your copies of the data saved in this browser.
        </p>
      </section>

      {note && <p className="hint data-dialog-note" role="status">{note}</p>}

      </div>
    </ImportDialog>
  );
}
