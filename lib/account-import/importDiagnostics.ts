import { useEffect, useState } from 'react';

/** Sanitized, page-memory-only reports require explicit URL opt-in on a known site host. */
export function importDiagnosticsAvailable(host: string, search: string): boolean {
  return ['arkpedia.net', 'www.arkpedia.net', 'preview.arkpedia.net', 'localhost', '127.0.0.1'].includes(host)
    && new URLSearchParams(search).get('importDiagnostics') === '1';
}

export function useImportDiagnostics(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(importDiagnosticsAvailable(window.location.hostname, window.location.search)); }, []);
  return enabled;
}
