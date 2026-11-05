import { useMemo } from 'react';
import PageMeta from '@/components/layout/PageMeta';
import type { GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import PageHeader from '@/components/ui/PageHeader';
import ProfileCard from '@/components/account/ProfileCard';
import PullHistory from '@/components/account/PullHistory';
import CloudAccountPanel from '@/components/account/CloudAccountPanel';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { useAccountActions } from '@/components/account/AccountActions';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
const ImportedFriends = dynamic(() => import('@/components/friends/ImportedFriends'), { ssr: false });
const FriendCollection = dynamic(() => import('@/components/friends/FriendCollection'), { ssr: false });
import { makeFriendFile, shareableRoster } from '@/lib/account/friendFile';
import { readRoster } from '@/lib/planner/roster';
import { friendOperators, type FriendOperator, type FriendSkin } from '@/lib/account/friendCatalogue';
import { withFriendDynamicArt } from '@/lib/skins/dynamicArtFallback';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { showAccount, useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { assistantCatalogue, type CardOutfit } from '@/lib/account/portraits';
import { SERVER_IDS, SERVERS } from '@/lib/account-import/yostar';
import SegmentedControl from '@/components/ui/SegmentedControl';
import styles from '@/components/account/AccountPage.module.css';
// The eyebrow names Rhodes Island's AI as the reader's story has it: PRTS, ZOOT after Episode 15.

/*
 * The reader's Arknights account (issue #94): what it holds, and Import / export
 * (components/account/DataDialog, the same dialog the planners open). The import replaces what
 * the site keeps of it -- the account record the lists filter by (lib/account/accountStore),
 * the Operator Planner's roster and depot -- all in this browser. The profile, the counts and
 * the pull history (components/account/PullHistory) are read from that record, after hydration.
 */

interface Props {
  /** Every outfit by skin id, with its art (the card's assistant wears one). */
  skins: (CardOutfit & Partial<FriendSkin>)[];
  operators?: FriendOperator[];
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => DATE.format(new Date(iso));

/** "6 years, 8 months", from a date to now. */
function age(iso: string, now: number): string {
  const from = new Date(iso), to = new Date(now);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  const years = Math.floor(months / 12), rest = months % 12;
  const parts = [years ? `${years} ${years === 1 ? 'year' : 'years'}` : '', rest || !years ? `${rest} ${rest === 1 ? 'month' : 'months'}` : ''];
  return parts.filter(Boolean).join(', ');
}

export default function AccountPage({ skins, operators }: Props) {
  const router = useRouter();
  const actions = useAccountActions();
  const account = useAccount();
  const floor = useHeightFloor(account?.server);
  const { remote, providers } = useCloudSync();
  const cloudAvailable = providers.length > 0 || !!remote;
  const settingUp = !!remote && !remote.profile;
  // The other servers imported on this browser: a switch between them, once there is one.
  const others = useOtherAccounts();
  const servers = account ? SERVER_IDS.filter((id) => id === account.server || others[id]) : [];
  // The planners hold the operators and depot of the latest import, whichever server is shown.
  const latest = account ? [account, ...Object.values(others)].reduce((a, b) => (b.importedAt > a.importedAt ? b : a)) : null;
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const panel = !router.query.settings && !router.query.confirm && typeof router.query.panel === 'string' ? router.query.panel : '';
  const openPanel = (value: string) => {
    const query: typeof router.query = { ...router.query, panel: value };
    delete query.settings; delete query.confirm;
    void router.push({ pathname: '/account', query }, undefined, { shallow: true, scroll: false });
  };
  const closePanel = () => { const query = { ...router.query }; delete query.panel; void router.replace({ pathname: '/account', query }, undefined, { shallow: true, scroll: false }); };
  const tab = panel === 'pulls' || panel === 'operators' || panel === 'skins' || panel === 'friends' ? panel : 'profile';
  const view = panel === 'operators' || panel === 'skins' ? panel : null;
  const collectionOperators = useMemo(() => operators ?? friendOperators(map, []), [operators, map]);
  const collectionSkins = useMemo(() => skins.map(skin => ({ ...skin, model: skin.model ?? null, series: skin.series ?? '' })), [skins]);

  // The outfits the account owns that the catalogue has (the card's Outfits Owned).
  const owns = useMemo(() => new Set(account?.skins ?? []), [account]);
  const ownedSkins = account ? skins.filter((skin) => owns.has(skin.id)).length : null;
  // The assistant's art and icon names, as scripts/audits/check-icon-coverage.ts checks them.
  const { outfitArt, outfitNames } = useMemo(() => assistantCatalogue(map, skins), [map, skins]);
  const profile = account?.profile;

  return (
    <>
      <PageMeta title="My Account" description="Your imported Arknights accounts and your profile, kept in this browser." path="/account" noindex />

      <PageHeader eyebrow="Rhodes Island // Account" title={cloudAvailable ? 'My Account' : 'My profile'}
        sub={cloudAvailable ? 'Your Arkpedia profile, cloud saves and imported Arknights accounts.' : 'Your imported Arknights accounts and profile saved in this browser.'}
        actions={<><button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={() => actions.open('import')}>Import / export</button><button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={() => actions.open('settings')}>Account settings</button></>} />

      <main>
        <CloudAccountPanel hideSettingsButton onOpenSettings={() => actions.open('settings')} onOpenData={() => actions.open('import')} />
        <Tabs id="account-content" label="Account content" className={styles.contentTabs} value={tab} onChange={openPanel} options={[
          { value: 'profile', label: 'Profile' }, { value: 'pulls', label: 'Pull history' }, { value: 'operators', label: 'Operators' }, { value: 'skins', label: 'Skins' }, { value: 'friends', label: 'Friends' },
        ]} />
        <div ref={floor.ref} {...tabPanelProps('account-content', tab)} className="account-tab-content">
        {tab === 'friends' && <ImportedFriends operators={collectionOperators} skins={collectionSkins} />}
        {tab === 'pulls' && <PullHistory key={account ? `${account.server}:${account.importedAt}` : 'empty'} account={account} map={map} />}
        {view && (account ? <FriendCollection key={view} inline own friend={makeFriendFile(account, shareableRoster(account, Object.values(others), readRoster()))} operators={collectionOperators} skins={collectionSkins} view={view} onClose={closePanel} /> : <p className="hint">Import your Arknights account to see your {view}.</p>)}
        {tab === 'profile' && !settingUp && <>
        {/* Drawn the same with or without an account, so the record arriving after
            hydration fills it in rather than moving everything below. */}
        {/* Drawn the same with or without an account until it arrives: the profile then
            replaces the placeholder of the same height (the Anti-Page Jump rule). */}
        <section className="op-section">
          {account && servers.length > 1 && (
            <SegmentedControl label="Server" className="account-server" value={account.server} onChange={showAccount}
              options={servers.map((id) => ({ value: id, label: SERVERS[id].label }))} />
          )}
          {account && latest && latest.server !== account.server && (
            <p className="hint">The Operator Planner keeps the operators and depot of your latest import, the {SERVERS[latest.server].label} account.</p>
          )}
          {account ? <ProfileCard account={account} map={map} outfits={ownedSkins ?? account.skins.length} outfitArt={outfitArt} outfitNames={outfitNames} collectionOwner="self" onOperators={() => openPanel('operators')} onSkins={() => openPanel('skins')} /> : (
            <div className="account-card account-card-empty">
              <p className="hint">No account imported yet: use Import / export above.</p>
            </div>
          )}
          {account && (
            <p className="hint">
              {`${profile?.registeredAt ? `Registered ${day(profile.registeredAt)}, ${age(profile.registeredAt, Date.now())} ago. ` : ''}Imported ${day(account.importedAt)} from the ${SERVERS[account.server].label} server.${profile?.secretary ? ` Assistant: ${profile.secretary}.` : ''}`}
            </p>
          )}
        </section>

        </>}
        {floor.spacer}</div>
      </main>

    </>
  );
}

/* Older releases may lack /account. Its collection catalogue is compiled into
   the bundle; regeneration must not scan source files absent from the runtime. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/account', async () => {
  const {accountCatalogue}=await import('@/lib/community/catalogues');
  const catalogue=await accountCatalogue();
  return {props:await withFriendDynamicArt(catalogue)};
}, {
  bundledWhenUnpublished: true,
  tables: DATA_DIALOG_TABLES,
  finalize: async props => withFriendDynamicArt(await fillAccountMap(props)),
});
