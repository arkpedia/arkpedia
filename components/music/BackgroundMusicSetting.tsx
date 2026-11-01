import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { usePagePlayback } from '@/lib/music/pageAudioPlayback';

export default function BackgroundMusicSetting() {
  const enabled = useSiteSetting('backgroundMusic'), consent = usePrivacyChoice('externalMedia');
  const playback = usePagePlayback();
  return <>
    <label className="check site-nav-popitem" title={consent ? 'Quiet homepage and event themes; your music player takes priority.' : 'Allow external media in Privacy choices first.'}>
      <input type="checkbox" checked={enabled} disabled={!consent} onChange={event => setSetting('backgroundMusic', event.target.checked)} />Background music
    </label>
    {enabled && consent && playback?.needsPlay && <button type="button" className="btn-bare site-nav-popitem" onClick={playback.play}>Play background music</button>}
  </>;
}
