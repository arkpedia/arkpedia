import MusicVisualizerSetting from '@/components/music/MusicVisualizerSetting';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ICONS } from './NavIcons';
import { useAccountActions } from '@/components/account/AccountActions';
import { PROFILE_LINKS } from '@/lib/nav/navLinks';
import ActionPopover from '@/components/ui/ActionPopover';
import ThemeToggle from './ThemeToggle';
import BackgroundMusicSetting from '@/components/music/BackgroundMusicSetting';
import ServerClock from './ServerClock';
import { SiteSearchTrigger, type SiteSearchControl } from './SiteSearch';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import ProfileAvatar from '@/components/account/ProfileAvatar';

export default function HeaderUtilities({ search, mobile = false, onOpen }: { search: SiteSearchControl; mobile?: boolean; onOpen?: () => void }) {
  const sync = useCloudSync();
  const router = useRouter();
  const icon = (name: string) => <span className="site-nav-icon" aria-hidden="true">{ICONS[name]}</span>;
  const accountLink = (panel: string, text: string, symbol: string) => <Link prefetch={false} className={`site-nav-popitem${router.pathname === '/account' && String(router.query.panel ?? 'profile') === panel ? ' active' : ''}`} href={panel === 'profile' ? PROFILE_LINKS[0].href : `/account?panel=${panel}`}>{icon(symbol)}{text}</Link>;
  const actions = useAccountActions();
  const signedIn = !!sync.remote;
  const label = signedIn ? 'My account' : sync.status === 'signed-out' ? 'Log in' : 'My profile';
  return <div className="header-utilities">
    <div className="header-utility-actions">
    <SiteSearchTrigger variant={mobile ? 'mobile' : 'bar'} control={search} />
    <ActionPopover navigation label="Settings" onOpen={onOpen} trigger={<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinejoin="round" d="m9 2-.7 2.4-2 1.2-2.4-.6-3 5.2L3 12l-2.1 1.8 3 5.2 2.4-.6 2 1.2L9 22h6l.7-2.4 2-1.2 2.4.6 3-5.2L21 12l2.1-1.8-3-5.2-2.4.6-2-1.2L15 2Z" /><circle cx="12" cy="12" r="3" /></svg>}>
      <p className="label-tag">Settings</p>
      <button type="button" className="btn-bare site-nav-popitem" onClick={() => actions.open('import')}>{icon('transfer')}Import / export</button>
      <button type="button" className="btn-bare site-nav-popitem" onClick={() => actions.open('settings')}>{icon('profile')}Account settings</button>
      <Link prefetch={false} className="site-nav-popitem" href="/cookies">{icon('privacy')}Privacy choices</Link>
      <p className="label-tag">Appearance</p><ThemeToggle menu />
      <p className="label-tag">Audio</p><BackgroundMusicSetting /><MusicVisualizerSetting menu />
    </ActionPopover>
    </div>
    <ServerClock variant={mobile ? 'mobile' : 'bar'} />
    <div className="header-utility-actions">
    <ActionPopover navigation label={label} onOpen={onOpen} trigger={<ProfileAvatar size={36} fallbackSize={20} />} className="profile-avatar-trigger">
      <p className="label-tag">{sync.remote?.profile?.username ?? label}</p>
      {sync.status === 'signed-out' && <button type="button" className="btn-bare site-nav-popitem" onClick={() => actions.open('settings')}>{icon('profile')}Log in</button>}
      {accountLink('profile', 'Profile', 'profile')}
      {accountLink('pulls', 'Pull history', 'history')}
      {accountLink('operators', 'Operators', 'roster')}
      {accountLink('skins', 'Skins', 'skins')}
      {accountLink('friends', 'Friends', 'friends')}
    </ActionPopover>
    </div>
  </div>;
}
