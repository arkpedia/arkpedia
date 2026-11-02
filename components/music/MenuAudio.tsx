import { useAccount } from '@/lib/account/accountStore';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { menuMusicId } from '@/lib/music/menuMusic';
import PageAudio from './PageAudio';

export default function MenuAudio() {
  const source = useSiteSetting('menuMusicSource'), custom = useSiteSetting('menuMusicTrack');
  const account = useAccount();
  return <PageAudio musicId={menuMusicId(source, custom, account?.homeBackground)} pageKey="site-menu" preference="backgroundMusic" allowEndfield={source === 'custom'} />;
}
