import MenuMusicSettings from './MenuMusicSettings';
import Link from 'next/link';
import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import AutoplayMusicChoice from './AutoplayMusicChoice';
export default function AudioSettings(){
  const background=useSiteSetting('backgroundMusic');
  return <div className="reading-copy"><AutoplayMusicChoice checked={background} onChange={value=>setSetting('backgroundMusic',value)} /><MenuMusicSettings /><p>External playback permission is managed in <Link href="/cookies">Privacy choices</Link>.</p></div>;
}
