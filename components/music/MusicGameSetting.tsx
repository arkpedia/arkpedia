import { useRef, useState } from 'react';
import RecordDialog from '@/components/ui/RecordDialog';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { ENDFIELD_NOTICE_TEXT, setEndfieldNoticeDismissed, shouldShowEndfieldNotice } from '@/lib/music/endfieldNotice';
import MusicSetting from './MusicSetting';

/** What a reader who turns Endfield music on should know, in the words the ⓘ shows. Endfield's
 *  songs have only YouTube uploads (scripts/sync/sync-endfield-albums.mjs), and a phone pauses
 *  YouTube's player when the page is hidden, where Monster Siren's files play on. */
export const ENDFIELD_SETTING_ABOUT = 'Endfield songs play from YouTube, so on phones they stop when the screen locks or you switch apps.';

function localStore(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * The player's Endfield music setting (lib/music/musicPlayerContext.tsx, setIncludeEndfield): a
 * real checkbox and an ⓘ, drawn as Data saver is (components/music/MusicSetting.tsx). Beside
 * Playlists in the music pages' header, and in the player bar's ⋯ menu with Data saver, so the
 * corner player on any page reaches it too. Off until the reader turns it on; their choice is
 * kept in this browser (lib/music/songFilter.ts).
 *
 * Turned on with a touch screen, it also says in a pop-up that those songs stop in the background
 * there, with a "Don't show again" box (lib/music/endfieldNotice.ts). The pop-up only informs:
 * closing it any way leaves Endfield music on. Rendered here, beside the checkbox, so in the ⋯
 * menu the focus stays inside the menu and the menu stays open behind it.
 */
export default function MusicGameSetting({ header = false }: { header?: boolean }) {
  const { includeEndfield, setIncludeEndfield } = useMusicPlayer();
  const [notice, setNotice] = useState(false);
  const [hideNotice, setHideNotice] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function change(on: boolean) {
    setIncludeEndfield(on);
    if (on && shouldShowEndfieldNotice(localStore(), window.matchMedia('(pointer: coarse)').matches)) {
      setHideNotice(false);
      setNotice(true);
    }
  }
  function close() {
    setNotice(false);
    input.current?.focus({ preventScroll: true });
  }

  return <>
    <MusicSetting label="Endfield music" topic="Endfield music" checked={includeEndfield} onChange={change}
      about={ENDFIELD_SETTING_ABOUT} header={header} inputRef={input} />
    {notice && <RecordDialog label="Endfield music on phones" onClose={close} className="music-endfield-dialog">
      <h2 className="section-title">Endfield music on phones</h2>
      <p>{ENDFIELD_NOTICE_TEXT}</p>
      <div className="music-endfield-dialog-actions">
        <label className="check"><input type="checkbox" checked={hideNotice}
          onChange={event => { setHideNotice(event.target.checked); setEndfieldNoticeDismissed(localStore(), event.target.checked); }} />Don&rsquo;t show again</label>
        <button type="button" className="primary btn-sm" onClick={close}>OK</button>
      </div>
    </RecordDialog>}
  </>;
}
