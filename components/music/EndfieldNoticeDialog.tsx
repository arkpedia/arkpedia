import { useState } from 'react';
import RecordDialog from '@/components/ui/RecordDialog';
import { ENDFIELD_NOTICE_TEXT, setEndfieldNoticeDismissed } from '@/lib/music/endfieldNotice';

function localStore(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * The pop-up a touch screen shows when Endfield music is turned on, from any control that turns
 * it on: a checkbox beside Playlists or in the ⋯ menu, or Discover's or the Library's "Include
 * Endfield music" (lib/music/musicPlayerContext.tsx opens it). It only informs: closing it any
 * way leaves Endfield music on. "Don't show again" is kept in this browser as soon as it is
 * ticked (lib/music/endfieldNotice.ts), so it holds however the pop-up is then closed.
 */
export default function EndfieldNoticeDialog({ onClose }: { onClose: () => void }) {
  const [hide, setHide] = useState(false);
  return (
    <RecordDialog label="Endfield music on phones" onClose={onClose} className="music-endfield-dialog">
      <h2 className="section-title">Endfield music on phones</h2>
      <p>{ENDFIELD_NOTICE_TEXT}</p>
      <div className="music-endfield-dialog-actions">
        <label className="check"><input type="checkbox" checked={hide}
          onChange={event => { setHide(event.target.checked); setEndfieldNoticeDismissed(localStore(), event.target.checked); }} />Don&rsquo;t show again</label>
        <button type="button" className="primary btn-sm" onClick={onClose}>OK</button>
      </div>
    </RecordDialog>
  );
}
