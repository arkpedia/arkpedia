import { useMusicPlayer } from '@/lib/music/musicPlayerContext';

/** What the setting changes, for the label's tooltip. */
export const ENDFIELD_SETTING_ABOUT = 'Include Arknights: Endfield’s soundtrack in the queue, shuffle, autoplay, Library and Discover.';

/**
 * The player's Endfield music setting (lib/music/musicPlayerContext.tsx, setIncludeEndfield): a
 * real checkbox in the site's .check primitive. Beside Playlists in the music pages' header, and
 * in the player bar's More menu with Data saver, so the corner player on any page reaches it too.
 * Off until the reader turns it on; their choice is kept in this browser (lib/music/songFilter.ts).
 */
export default function MusicGameSetting({ inMenu = false }: { inMenu?: boolean }) {
  const { includeEndfield, setIncludeEndfield } = useMusicPlayer();
  return (
    <label className={`check music-endfield-setting${inMenu ? ' music-endfield-setting-menu' : ''}`} title={ENDFIELD_SETTING_ABOUT}>
      <input type="checkbox" checked={includeEndfield} onChange={event => setIncludeEndfield(event.target.checked)} />
      Endfield music
    </label>
  );
}
