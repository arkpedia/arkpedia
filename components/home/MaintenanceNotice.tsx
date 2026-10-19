import { SERVER_IDS } from '@/lib/account-import/yostar';
import { currentMaintenance, maintenanceText, type RegionalMaintenance } from '@/lib/home/maintenance';

/** The home page's word about a server maintenance announced in game, while it is still to come
 *  or under way. Rendered from the page's props and the request clock, so the first paint and
 *  hydration agree, and the page never grows under the reader after it loads.
 *
 *  Every server's notice is in the markup, and CSS shows the site's server's (front.css, by the
 *  <html data-site-server> the boot script in _document sets before the first paint): the
 *  server is the reader's own choice, which the server-side render cannot know, and swapping the
 *  notice after hydration would move the page. */
export default function MaintenanceNotice({ maintenance, now }: { maintenance: RegionalMaintenance; now: number }) {
  return (
    <>
      {SERVER_IDS.map(server => {
        const current = currentMaintenance(maintenance[server] ?? [], now);
        if (!current.length) return null;
        return (
          <aside key={server} className="maintenance-notice" data-server={server} aria-label="Server maintenance">
            {current.map(window => (
              <p key={window.startAt}>
                <span className="maintenance-notice-dot" aria-hidden="true" />
                <span>{maintenanceText(window, now, server)}</span>
                {' '}<a href={window.url} target="_blank" rel="noopener noreferrer">Notice</a>
              </p>
            ))}
          </aside>
        );
      })}
    </>
  );
}
