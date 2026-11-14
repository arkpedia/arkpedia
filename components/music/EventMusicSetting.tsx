import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { usePagePlayback } from '@/lib/music/pageAudioPlayback';

export default function EventMusicSetting() {
  const enabled = useSiteSetting('eventMusic'), consent = usePrivacyChoice('externalMedia');
  const playback = usePagePlayback();
  return <>
    <label className="check site-nav-popitem" title={consent ? 'Original entrance effects and event lobby music. Your personal music pauses during events and resumes when you leave.' : 'Allow external media in Privacy choices first.'}>
      <input type="checkbox" checked={enabled} disabled={!consent} onChange={event => setSetting('eventMusic', event.target.checked)} />Event Music
    </label>
    {consent && playback?.needsPlay && <button type="button" className="btn-bare site-nav-popitem" onClick={playback.play}>Play event music</button>}
  </>;
}
