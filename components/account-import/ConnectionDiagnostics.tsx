import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { connectionDiagnostics } from '@/lib/account-import/connectionDiagnostics';
import { rawSave } from '@/lib/account-import/rawSaveExport';

export default function ConnectionDiagnostics() {
  const id = useId();
  const report = useSyncExternalStore(connectionDiagnostics.subscribe, connectionDiagnostics.snapshot, () => '');
  const [copied, setCopied] = useState('');
  const save = useSyncExternalStore(rawSave.subscribe, rawSave.get, () => null);
  useEffect(() => { setCopied(''); }, [report]);
  // A failed connection, or an import's beginner-reward summary (lib/account-import/beginnerDiagnostics.ts).
  if (!report || !(report.includes('"failure"') || report.includes('"beginner"'))) return null;
  return <details className="import-diagnostics">
    <summary>Connection diagnostics</summary>
    <div className="import-diagnostics-body">
    <p className="hint">Stays in this page until reload. Contains connection results and, after an import, how many of each reward record the save has (missions, sign-ins, beginner rewards): no login details, names, IDs or dates. Nothing is uploaded.</p>
    <p className="hint">browser-to-relay: the relay connection failed or closed. relay-to-upstream: the relay reported an upstream failure. relay-policy: the relay refused a stream. tls: encrypted connection setup failed. unknown: the failed connection could not be identified.</p>
    <div className="data-dialog-acts">
    <button type="button" className="ghost btn-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(report); setCopied('Copied'); } catch { setCopied('Select the report below to copy it.'); }
    }}>Copy diagnostics</button>
    {save !== null && <button type="button" className="ghost btn-sm" onClick={() => {
      // Off the main site only (rawSaveAllowed): the last import's save, identity stripped, as a file.
      const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'arkpedia-save-redacted.json' });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Download save (redacted)</button>}
    <span className="hint" role="status">{copied}</span>
    </div>
    <label className="visually-hidden" htmlFor={id}>Diagnostic report</label>
    <textarea className="import-diagnostics-report" id={id} readOnly value={report} rows={7} spellCheck={false} />
    </div>
  </details>;
}
