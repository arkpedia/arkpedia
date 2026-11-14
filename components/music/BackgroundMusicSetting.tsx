import { useAccountActions } from '@/components/account/AccountActions';
import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { usePagePlayback } from '@/lib/music/pageAudioPlayback';

export default function BackgroundMusicSetting() {
  const enabled = useSiteSetting('backgroundMusic'), events = useSiteSetting('eventMusic'), consent = usePrivacyChoice('externalMedia');
  const playback = usePagePlayback();
  const actions = useAccountActions();
  return <>
    <label className="check site-nav-popitem" title={consent ? 'Your chosen theme while browsing, except on event pages and in Music Guesser. Your music player takes priority.' : 'Allow external media in Privacy choices first.'}>
      <input type="checkbox" checked={enabled} disabled={!consent} onChange={event => setSetting('backgroundMusic', event.target.checked)} />Background Music
    </label>
    <label className="check site-nav-popitem" title={consent ? 'Original entrance sound effects and the event’s lobby music. Your music player takes priority.' : 'Allow external media in Privacy choices first.'}>
      <input type="checkbox" checked={events} disabled={!consent} onChange={event => setSetting('eventMusic', event.target.checked)} />Event Music
    </label>
    <button type="button" className="btn-bare site-nav-popitem" onClick={() => actions.open('menu-music')}>Choose Background Music</button>
    {consent && playback?.needsPlay && <button type="button" className="btn-bare site-nav-popitem" onClick={playback.play}>Play background music</button>}
  </>;
}
