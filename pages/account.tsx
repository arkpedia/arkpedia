import { useMemo, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/ui/PageHeader';
import DataDialog from '@/components/account/DataDialog';
import ProfileCard from '@/components/account/ProfileCard';
import PullHistory from '@/components/account/PullHistory';
import CloudAccountPanel from '@/components/account/CloudAccountPanel';
const FriendCollection = dynamic(() => import('@/components/friends/FriendCollection'), { ssr: false });
import { makeFriendFile, shareableRoster } from '@/lib/account/friendFile';
import { readRoster } from '@/lib/planner/roster';
import { friendOperators, type FriendOperator, type FriendSkin } from '@/lib/account/friendCatalogue';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { showAccount, useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { assistantCatalogue, type CardOutfit } from '@/lib/account/portraits';
import { SERVER_IDS, SERVERS } from '@/lib/account-import/yostar';
import SegmentedControl from '@/components/ui/SegmentedControl';
// The eyebrow names Rhodes Island's AI as the reader's story has it: PRTS, ZOOT after Episode 15.
import { storyAI } from '@/lib/account/prts';

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
  const account = useAccount();
  // The other servers imported on this browser: a switch between them, once there is one.
  const others = useOtherAccounts();
  const servers = account ? SERVER_IDS.filter((id) => id === account.server || others[id]) : [];
  // The planners hold the operators and depot of the latest import, whichever server is shown.
  const latest = account ? [account, ...Object.values(others)].reduce((a, b) => (b.importedAt > a.importedAt ? b : a)) : null;
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<'operators' | 'skins' | null>(null);
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
      <Head>
        <title>My Account — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>

      <PageHeader eyebrow={`${storyAI(account)} // Account`} title="My Account"
        sub="Your Arknights account (Global, Japan or Korea): what you own, for the planners and the lists."
        actions={<button type="button" className="primary btn-sm" aria-haspopup="dialog" onClick={() => setImporting(true)}>Import / export</button>} />

      <main>
        <CloudAccountPanel />
        {/* Drawn the same with or without an account, so the record arriving after
            hydration fills it in rather than moving everything below. */}
        {/* Drawn the same with or without an account until it arrives: the profile then
            replaces the placeholder of the same height (the Anti-Page Jump rule). */}
        <section className="op-section">
          <h2>Profile</h2>
          {account && servers.length > 1 && (
            <SegmentedControl label="Server" className="account-server" value={account.server} onChange={showAccount}
              options={servers.map((id) => ({ value: id, label: SERVERS[id].label }))} />
          )}
          {account && latest && latest.server !== account.server && (
            <p className="hint">The Operator Planner keeps the operators and depot of your latest import, the {SERVERS[latest.server].label} account.</p>
          )}
          {account ? <ProfileCard account={account} map={map} outfits={ownedSkins ?? account.skins.length} outfitArt={outfitArt} outfitNames={outfitNames} collectionOwner="self" onOperators={() => setView('operators')} onSkins={() => setView('skins')} /> : (
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

        <section className="op-section">
          <h2>Pull History</h2>
          <PullHistory key={account ? `${account.server}:${account.importedAt}` : 'empty'} account={account} map={map} />
        </section>
      </main>

      {account && view && <FriendCollection own friend={makeFriendFile(account, shareableRoster(account, Object.values(others), readRoster()))} operators={collectionOperators} skins={collectionSkins} view={view} onClose={() => setView(null)} />}
      {importing && <DataDialog onClose={() => setImporting(false)} />}
    </>
  );
}

/* bundledWhenUnpublished: the releases before /account have no such page, and on Vercel there
   is no data/ to build it from. The builder reads only the skins compiled into the bundle and
   the tables' module imports, so it can run there. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/account', async () => {
  const [{ getAllSkins }, { getAllOperators }] = await Promise.all([import('@/lib/skins/skins'), import('@/lib/operators/operators')]);
  const map = await DATA_DIALOG_TABLES['game-account-map']();
  return { props: {
    // As /skins counts them: an outfit only CN has is not Global's yet.
    // Each outfit by its game id, with its art: the card shows the assistant in theirs.
    operators: friendOperators(map, getAllOperators()),
    skins: getAllSkins().flatMap(skin => skin.skinId ? [{ id: skin.skinId, name: skin.name, model: skin.model, series: skin.series, image: skin.image }] : []),
  } };
}, {
  bundledWhenUnpublished: true,
  tables: DATA_DIALOG_TABLES,
  finalize: fillAccountMap,
});
