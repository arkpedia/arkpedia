import { useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import type { CalendarServer } from '@/lib/schedule/calendarFeed';

export default function CalendarSubscription({ server, birthdays, onClose }: { server: CalendarServer; birthdays: boolean; onClose: () => void }) {
  const [includePredicted, setIncludePredicted] = useState(true);
  const [includeBirthdays, setIncludeBirthdays] = useState(birthdays);
  const [copied, setCopied] = useState('');
  const serverName = server === 'en' ? 'Global' : server === 'jp' ? 'Japan' : 'Korea';
  const path = `/api/calendar.ics?server=${server}&predicted=${includePredicted ? '1' : '0'}&birthdays=${includeBirthdays ? '1' : '0'}`;
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  const webcal = url.replace(/^https?:/, 'webcal:');
  return <ImportDialog title="Sync calendar" className="calendar-subscription-dialog" onClose={onClose}>
    <div className="calendar-subscription-body">
      <p>Subscribe to the <strong>{serverName}</strong> schedule for automatic event and date updates. Your calendar app controls refresh timing; changes may take several hours.</p>
      <div className="calendar-subscription-options">
        <label className="check"><input type="checkbox" checked={includePredicted} onChange={event => { setIncludePredicted(event.target.checked); setCopied(''); }} />Include predicted dates</label>
        <label className="check"><input type="checkbox" checked={includeBirthdays} onChange={event => { setIncludeBirthdays(event.target.checked); setCopied(''); }} />Include operator birthdays</label>
      </div>
      <p><strong>[Confirmed]</strong> dates are confirmed for {serverName}. <strong>[Predicted] … (CN estimate)</strong> dates come from the CN schedule and may change.{server !== 'en' && <> Dates using Global as a fallback say <strong>[Predicted] … (Global fallback)</strong>.</>}</p>
      <p>Includes all published event dates. Turn off predictions for a confirmed-only calendar.</p>
      <label className="calendar-subscription-url">Subscription URL
        <input type="text" readOnly value={url} onFocus={event => event.currentTarget.select()} />
      </label>
      <div className="calendar-subscription-actions">
        <a href={webcal} className="btn primary btn-sm">Subscribe in calendar app ↗</a>
        <button type="button" className="ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied('Subscription URL copied.'); }
          catch { setCopied('Select and copy the subscription URL above.'); }
        }}>Copy subscription URL</button>
      </div>
      <span role="status" className="visually-hidden">{copied}</span>
      {copied && <p className="hint">{copied}</p>}
      <p>Google Calendar: <strong>Other calendars → From URL</strong>. Apple Calendar / Outlook: <strong>Subscribe</strong> or <strong>From Internet</strong>. Paste the subscription URL.</p>
      <div className="calendar-subscription-download">
        <a href={`${path}&download=1`} download={`arkpedia-${server}.ics`} className="ghost">Download .ics</a>
        <span>A one-time copy. Importing this file does not sync future changes.</span>
      </div>
    </div>
  </ImportDialog>;
}
