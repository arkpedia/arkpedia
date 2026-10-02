import { useState } from 'react';
import GameSignIn from '@/components/account-import/GameSignIn';
import ImportDialog from '@/components/account/ImportDialog';
import { useReleaseTable } from '@/lib/content/context';
import { depotNames, type MaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { unheldSummary, type ImportAliases } from '@/lib/planner/foreignImport';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { loadFromFile, saveToFile } from '@/lib/planner/fileTransfer';
import { storePlannerTransfer } from '@/lib/planner/storeTransfer';
import { PULL_PLAN_KEY, type SavedPullPlan } from '@/lib/pulls/plan';
import { writePastProgress } from '@/lib/pulls/pastProgress';
import { importGameAccount, type ImportResult } from '@/lib/account/importAccount';
import { applyBackup, backupFilename, formatBackup } from '@/lib/account/backup';
import { readImportFile } from '@/lib/account/importFile';
import { useAccount, writeAccount } from '@/lib/account/accountStore';

/** "412 operators, 375 skins, 77 materials, 1,840 stages cleared and your profile". */
function importedSummary(result: ImportResult): string {
  const n = (count: number, one: string, many: string) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
  return [n(result.operators, 'operator', 'operators'), n(result.record.skins.length, 'skin', 'skins'), n(result.materials, 'material', 'materials'),
    n(result.record.cleared.length, 'stage cleared', 'stages cleared')].join(', ') + (result.record.profile ? ' and your profile' : '');
}

/*
 * Import / export: the one dialog for everything the site keeps of the reader, on the Account
 * page only (the planners link there: components/account/DataLink). From the game
 * (components/account-import/GameSignIn); from a file or pasted text, whatever
 * lib/account/importFile reads; an export of all of it (lib/account/backup); and Forget this
 * account. A file is written to storage, which the page it belongs to reads when it next
 * loads. The page must carry the three tables it reads (lib/content/tables.mjs).
 */
export default function DataDialog({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const aliases = useReleaseTable<ImportAliases>('import-aliases');
  const catalogue = useReleaseTable<MaterialCatalogue>('material-catalogue');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState('');

  function onAccount(user: Record<string, any>) {
    setResult(importGameAccount(user, { map, aliases, depotNames: depotNames(catalogue) }));
  }

  function applyText(input: string, source: string) {
    const file = readImportFile(input, aliases);
    if (file.kind === 'refused') { setNote(`${file.reason} (${source})`); return; }
    if (file.kind === 'backup') {
      try {
        applyBackup(file.backup);
      } catch {
        setNote('This browser would not store the backup, so nothing was changed.');
        return;
      }
      const what = file.backup.stores.map((store) => store.label);
      setNote(`Restored ${what.length ? what.join(', ') : 'nothing (the backup is empty)'}${file.backup.savedAt ? `, from a backup of ${file.backup.savedAt.slice(0, 10)}` : ''}. Reloading so every part of this page reads it…`);
      window.setTimeout(() => window.location.reload(), 1200);
      return;
    }
    if (file.kind === 'pull-plan') {
      /* The file's resources and ticks stand over the current account import's: marked as
         already filled from it (walletFrom, ticksFrom), and the ticks go to their own store
         (lib/pulls/pastProgress.ts), which the Pull Planner and the OP Tracker read. */
      const at = account?.importedAt ?? '';
      const plan: SavedPullPlan = { ...file.plan, ...(at ? { walletFrom: at, ticksFrom: at } : {}) };
      window.localStorage.setItem(PULL_PLAN_KEY, JSON.stringify(plan));
      writePastProgress({ doneKeys: plan.doneKeys, doneEvents: plan.doneEvents, annihilationDone: plan.annihilationDone, ticksFrom: plan.ticksFrom ?? '' });
      setNote(`Loaded the pull plan from ${source}. The Pull Planner opens with it.`);
      return;
    }
    setNote(storePlannerTransfer(file.parsed, depotNames(catalogue)));
  }

  async function exportAll(): Promise<void> {
    const saved = await saveToFile(formatBackup(window.localStorage), backupFilename());
    if (!saved) { setNote('Nothing saved.'); return; }
    setNote(saved.chosen ? `Saved as ${saved.name}, where you chose.` : `Downloaded as ${saved.name}: it is in your browser's downloads.`);
  }

  return (
    <ImportDialog title="Import / export" className="data-dialog" onClose={onClose}>
      <div className="data-dialog-body">
      <section className="data-dialog-part" aria-labelledby="data-game">
        <h3 id="data-game">From the game</h3>
        <p className="import-copy">
          Import data directly from your Arknights (Global) account. Your login is sent encrypted and is never
          read by Arkpedia itself; Arkpedia only receives your account data. Nothing of the login is kept: each
          import asks for a new code.
        </p>
        <p className="hint import-note">
          Importing replaces your operators, depot and account, and kicks you out of the game if you are logged in.
        </p>
        <GameSignIn server="en" idPrefix="data" onAccount={onAccount} />
        {result && (
          <p className="hint import-note" role="status">
            Imported: {importedSummary(result)}.{unheldSummary(result.unknown)}
          </p>
        )}
      </section>

      <section className="data-dialog-part" aria-labelledby="data-file">
        <h3 id="data-file">From a file</h3>
        <div className="data-dialog-acts">
          <button type="button" className="ghost btn-sm" onClick={async () => {
            const opened = await loadFromFile();
            if (!opened) { setNote('Nothing loaded.'); return; }
            if (opened.tooLarge) { setNote(`${opened.name} is far larger than any Arkpedia file, so it was not read.`); return; }
            applyText(opened.text, opened.name);
          }}>Import file</button>
        </div>
        <p className="hint">
          An Arkpedia backup restores everything in it. Also read: an older Operator Planner or Pull Planner
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
          <button type="button" className="primary btn-sm" onClick={() => { void exportAll(); }}>Export everything</button>
        </div>
        <p className="hint">
          One file with all Arkpedia keeps for you in this browser: your imported account, the Operator Planner&apos;s
          operators, depot, goals and crafting, the Pull Planner, the skin wishlist, your base setups and music
          favourites. Nothing of it is kept anywhere else, so this file is your copy.
        </p>
      </section>

      {note && <p className="hint data-dialog-note" role="status">{note}</p>}

      <section className="data-dialog-part data-dialog-forget" aria-label="Forget this account">
        <button type="button" className="ghost btn-sm" disabled={!account} onClick={() => { writeAccount(null); setResult(null); setNote('Your account is forgotten on this browser. The planners keep their own data until you clear it there.'); }}>
          Forget this account
        </button>
        <span className="hint">Clears the imported account from this browser.</span>
      </section>
      </div>
    </ImportDialog>
  );
}
