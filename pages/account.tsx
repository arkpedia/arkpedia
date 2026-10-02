import { useMemo, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import DataDialog from '@/components/account/DataDialog';
import ProfileCard from '@/components/account/ProfileCard';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { useAccount } from '@/lib/account/accountStore';
// The eyebrow names Rhodes Island's AI as the reader's story has it: PRTS, ZOOT after Episode 15.
import { storyAI } from '@/lib/account/prts';

/*
 * The reader's Arknights account (issue #94): what it holds, and Import / export
 * (components/account/DataDialog, the same dialog the planners open). The import replaces what
 * the site keeps of it -- the account record the lists filter by (lib/account/accountStore),
 * the Operator Planner's roster and depot -- all in this browser. The profile and the counts
 * are read from that record, after hydration.
 */

interface Props {
  /** Every outfit by skin id, with its art (the card's assistant wears one). */
  skins: { id: string; image: string | null }[];
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

export default function AccountPage({ skins }: Props) {
  const account = useAccount();
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const [importing, setImporting] = useState(false);

  // The outfits the account owns that the catalogue has (the card's Outfits Owned).
  const owns = useMemo(() => new Set(account?.skins ?? []), [account]);
  const ownedSkins = account ? skins.filter((skin) => owns.has(skin.id)).length : null;
  const outfitArt = useMemo(() => new Map(skins.flatMap((skin) => (skin.image ? [[skin.id, skin.image] as const] : []))), [skins]);
  const profile = account?.profile;

  return (
    <>
      <Head>
        <title>Account — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>

      <PageHeader eyebrow={`${storyAI(account)} // Account`} title="Account"
        sub="Your Arknights (Global) account: what you own, for the planners and the lists."
        actions={<button type="button" className="primary btn-sm" aria-haspopup="dialog" onClick={() => setImporting(true)}>Import / export</button>} />

      <main>
        {/* Drawn the same with or without an account, so the record arriving after
            hydration fills it in rather than moving everything below. */}
        {/* Drawn the same with or without an account until it arrives: the profile then
            replaces the placeholder of the same height (the Anti-Page Jump rule). */}
        <section className="op-section">
          <h2>Profile</h2>
          {account ? <ProfileCard account={account} map={map} outfits={ownedSkins ?? account.skins.length} outfitArt={outfitArt} /> : (
            <div className="account-card account-card-empty">
              <p className="hint">No account imported yet: use Import / export above.</p>
            </div>
          )}
          {account && (
            <p className="hint">
              {`${profile?.registeredAt ? `Registered ${day(profile.registeredAt)}, ${age(profile.registeredAt, Date.now())} ago. ` : ''}Imported ${day(account.importedAt)}.${profile?.secretary ? ` Assistant: ${profile.secretary}.` : ''}`}
            </p>
          )}
        </section>


      </main>

      {importing && <DataDialog onClose={() => setImporting(false)} />}
    </>
  );
}

/* bundledWhenUnpublished: the releases before /account have no such page, and on Vercel there
   is no data/ to build it from. The builder reads only the skins compiled into the bundle and
   the tables' module imports, so it can run there. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/account', async () => {
  const { getAllSkins } = await import('@/lib/skins/skins');
  return { props: {
    // As /skins counts them: an outfit only CN has is not Global's yet.
    // Each outfit by its game id, with its art: the card shows the assistant in theirs.
    skins: getAllSkins().filter((skin) => skin.skinId).map((skin) => ({ id: skin.skinId!, image: skin.image ?? null })),
  } };
}, {
  bundledWhenUnpublished: true,
  tables: DATA_DIALOG_TABLES,
  finalize: fillAccountMap,
});
