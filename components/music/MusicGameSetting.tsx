import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import MusicSetting from './MusicSetting';

/** What a reader who turns Endfield music on should know, in the words the ⓘ shows. Endfield's
 *  songs have only YouTube uploads (scripts/sync/sync-endfield-albums.mjs), and a phone pauses
 *  YouTube's player when the page is hidden, where Monster Siren's files play on. */
export const ENDFIELD_SETTING_ABOUT = 'Endfield songs play from YouTube, so on phones they stop when the screen locks or you switch apps.';

/**
 * The player's Endfield music setting (lib/music/musicPlayerContext.tsx, setIncludeEndfield): a
 * real checkbox and an ⓘ, drawn as Data saver is (components/music/MusicSetting.tsx). Beside
 * Playlists in the music pages' header, and in the player bar's ⋯ menu with Data saver, so the
 * corner player on any page reaches it too. Off until the reader turns it on; their choice is
 * kept in this browser (lib/music/songFilter.ts). On a touch screen, turning it on also opens
 * the player's pop-up about background play (components/music/EndfieldNoticeDialog.tsx).
 */
export default function MusicGameSetting({ header = false }: { header?: boolean }) {
  const { includeEndfield, setIncludeEndfield } = useMusicPlayer();
  return <MusicSetting label="Endfield music" topic="Endfield music" checked={includeEndfield} onChange={setIncludeEndfield}
    about={ENDFIELD_SETTING_ABOUT} header={header} />;
}
