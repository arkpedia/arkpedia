import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { stageDiagnostics, stageDiagnosticsAvailable } from '@/lib/account-import/stageDiagnostics';
import type { ServerId } from '@/lib/account-import/yostar';

export default function StageDiagnostics({ server, busy }: { server: ServerId; busy: boolean }) {
  const id = useId();
  const [enabled, setEnabled] = useState(false);
  const state = useSyncExternalStore(stageDiagnostics.subscribe, stageDiagnostics.snapshot, stageDiagnostics.snapshot);
  useEffect(() => { setEnabled(stageDiagnosticsAvailable(window.location.hostname, window.location.search)); }, []);
  if (!enabled) return null;
  return <details className="import-diagnostics" open>
    <summary>Stage metadata test</summary>
    <div className="import-diagnostics-body">
      <p className="hint">Captures stage IDs, field names and numeric change markers from your next import. No login details, extra game requests or uploads. Captures disappear on reload.</p>
      <div className="data-dialog-acts">
        <button type="button" className="ghost btn-sm" disabled={busy || state.count >= 3} onClick={() => state.armed ? stageDiagnostics.cancel() : stageDiagnostics.arm(server)}>{state.armed ? 'Cancel capture' : 'Capture next import'}</button>
        {(state.count > 0 || state.armed) && <button type="button" className="ghost btn-sm" disabled={busy} onClick={stageDiagnostics.clear}>Clear captures</button>}
      </div>
      <p className="hint" role="status">{state.armed === server ? 'Ready for one import. Do not refresh this tab.' : state.armed ? 'Capture is armed for another server.' : state.count ? `${state.count} of 3 captures saved in this tab.` : 'Capture is off.'}</p>
      {state.report && <>
        <label htmlFor={id}>Stage metadata report</label>
        <textarea className="import-diagnostics-report" id={id} readOnly value={state.report} rows={7} spellCheck={false} />
      </>}
    </div>
  </details>;
}
