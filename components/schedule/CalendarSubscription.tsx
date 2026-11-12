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
      <p>Keep the <strong>{serverName}</strong> event schedule in your calendar, with automatic date updates.</p>
      <div className="calendar-subscription-options">
        <label className="check"><input type="checkbox" checked={includePredicted} onChange={event => { setIncludePredicted(event.target.checked); setCopied(''); }} />Include predicted dates</label>
        <label className="check"><input type="checkbox" checked={includeBirthdays} onChange={event => { setIncludeBirthdays(event.target.checked); setCopied(''); }} />Include operator birthdays</label>
      </div>
      <div className="calendar-subscription-legend support-copy">
        <p><strong>[Confirmed]</strong><span>Official dates for {serverName}.</span></p>
        <p><strong>[Predicted]</strong><span>CN estimates; dates may change.</span></p>
        {server !== 'en' && <p><strong>[Predicted]</strong><span>Global fallback; awaiting local confirmation.</span></p>}
      </div>
      <div className="calendar-subscription-connect">
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
        <div className="calendar-subscription-help support-copy">
          <p><strong>Google Calendar</strong> · Other calendars → From URL</p>
          <p><strong>Apple Calendar / Outlook</strong> · Subscribe or From Internet</p>
          <p>Paste the URL above. Updates may take several hours, depending on your calendar app.</p>
        </div>
      </div>
      <div className="calendar-subscription-download">
        <a href={`${path}&download=1`} download={`arkpedia-${server}.ics`} className="ghost">Download .ics</a>
        <span className="support-copy">One-time copy. Future changes won’t sync.</span>
      </div>
    </div>
  </ImportDialog>;
}
