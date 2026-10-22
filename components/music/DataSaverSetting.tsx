import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import MusicSetting from './MusicSetting';

/** What Data saver changes, in the words the ⓘ shows. */
export const DATA_SAVER_ABOUT = 'Songs play from the official Arknights music player, which allows background play, but the files are large. Data saver plays songs from YouTube instead, but background play becomes unavailable.';

/** The player's Data saver setting (lib/music/musicPlayerContext.tsx, setDataSaver), in the ⋯ menu:
 *  a checkbox and an ⓘ with what it changes (components/music/MusicSetting.tsx). */
export default function DataSaverSetting() {
  const { dataSaver, setDataSaver } = useMusicPlayer();
  return <MusicSetting label="Data saver" topic="data saver" checked={dataSaver} onChange={setDataSaver} about={DATA_SAVER_ABOUT} />;
}
