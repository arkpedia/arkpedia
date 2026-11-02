import { usePrivacyChoice } from '@/lib/privacy/preferences';
import MenuMusicSettings from './MenuMusicSettings';
import Link from 'next/link';
import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import AutoplayMusicChoice from './AutoplayMusicChoice';
export default function AudioSettings(){
  const media=usePrivacyChoice('externalMedia');
  const background=useSiteSetting('backgroundMusic');
  const events=useSiteSetting('eventMusic');
  return <div className="reading-copy">
    <AutoplayMusicChoice kind="background" checked={background} onChange={value=>setSetting('backgroundMusic',value)} disabled={!media} />
    <AutoplayMusicChoice kind="event" checked={events} onChange={value=>setSetting('eventMusic',value)} disabled={!media} />
    <p role="status">{media ? 'External media is allowed. ' : 'External media permission required for autoplay. '}<Link href="/cookies">Manage media permission</Link>.</p><MenuMusicSettings />
  </div>;
}
