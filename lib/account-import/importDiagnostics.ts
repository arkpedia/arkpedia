import { useEffect, useState } from 'react';

/** Explicit test tools on Preview/local only; a production query cannot enable them. */
export function importDiagnosticsAvailable(host: string, search: string): boolean {
  return ['preview.arkpedia.net', 'localhost', '127.0.0.1'].includes(host)
    && new URLSearchParams(search).get('importDiagnostics') === '1';
}

export function useImportDiagnostics(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(importDiagnosticsAvailable(window.location.hostname, window.location.search)); }, []);
  return enabled;
}
