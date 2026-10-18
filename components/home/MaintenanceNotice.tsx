import { currentMaintenance, maintenanceText, type MaintenanceWindow } from '@/lib/home/maintenance';

/** The home page's word about a Global server maintenance announced in game, while it is still to
 *  come or under way. Rendered from the page's props and the request clock, so the first paint and
 *  hydration agree, and the page never grows under the reader after it loads. */
export default function MaintenanceNotice({ windows, now }: { windows: readonly MaintenanceWindow[]; now: number }) {
  const current = currentMaintenance(windows, now);
  if (!current.length) return null;
  return (
    <aside className="maintenance-notice" aria-label="Server maintenance">
      {current.map(window => (
        <p key={window.startAt}>
          <span className="maintenance-notice-dot" aria-hidden="true" />
          {maintenanceText(window, now)}
          {' '}<a href={window.url} target="_blank" rel="noopener noreferrer">Notice</a>
        </p>
      ))}
    </aside>
  );
}
