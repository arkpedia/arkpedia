import { useMemo, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import GameSignIn from '@/components/account-import/GameSignIn';
import ImportDialog from '@/components/account/ImportDialog';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { depotNames, checkMaterialCatalogue, type MaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { checkImportAliases, unheldSummary, type ImportAliases } from '@/lib/planner/foreignImport';
import { checkGameAccountMap, type GameAccountMap } from '@/lib/planner/gameAccount';
import { importGameAccount, type ImportResult } from '@/lib/account/importAccount';
import { useAccount, writeAccount } from '@/lib/account/accountStore';

/*
 * The reader's Arknights account (issue #94): the one place it is imported, and what it
 * holds. The import replaces what the site keeps of it -- the account record the lists filter
 * by (lib/account/accountStore), the Operator Planner's roster and depot -- all in this
 * browser. The profile and the counts are read from that record, after hydration.
 */

interface Props {
  /** Every outfit by skin id, and whether the catalogue has it on Global. (The operators
   *  Global has come with the id map, which marks the ones its client carries.) */
  skins: { id: string; global: boolean }[];
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

function Count({ label, owned, total, href, linkLabel }: { label: string; owned: number | null; total: number; href: string; linkLabel: string }) {
  const share = owned == null || !total ? 0 : Math.min(1, owned / total);
  return (
    <div className="account-count">
      <div className="account-count-head">
        <span className="account-count-label">{label}</span>
        <span className="account-count-value">{owned == null ? '—' : owned} <small>/ {total}</small></span>
      </div>
      <div className="account-bar" aria-hidden="true"><span style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>
      <Link prefetch={false} href={href} className="account-count-link">{linkLabel}</Link>
    </div>
  );
}

export default function AccountPage({ skins }: Props) {
  const account = useAccount();
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const aliases = useReleaseTable<ImportAliases>('import-aliases');
  const catalogue = useReleaseTable<MaterialCatalogue>('material-catalogue');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const [importing, setImporting] = useState(false);

  // Every operator the Global client carries (scripts/build/build-game-account-map.ts).
  const released = useMemo(() => new Set(Object.values(map.chars).filter((char) => char.global).map((char) => char.name)), [map]);
  const ownedOperators = account ? account.operators.filter((name) => released.has(name)).length : null;
  // Global's outfits, and any the account owns: an outfit someone has on Global is Global's,
  // whatever the catalogue's release line still says (five event outfits read "[CN] ..." on
  // the day they were on sale, 2026-10-01).
  const owns = useMemo(() => new Set(account?.skins ?? []), [account]);
  const skinTotal = skins.filter((skin) => skin.global || owns.has(skin.id)).length;
  const ownedSkins = account ? skins.filter((skin) => owns.has(skin.id)).length : null;
  const profile = account?.profile;

  function onAccount(user: Record<string, any>) {
    setResult(importGameAccount(user, { map, aliases, depotNames: depotNames(catalogue) }));
    setForgotten(false);
  }

  return (
    <>
      <Head>
        <title>Account — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>

      <PageHeader eyebrow="Rhodes Island // Account" title="Account"
        sub="Your Arknights (Global) account: what you own, for the planners and the lists."
        actions={<button type="button" className="primary btn-sm" onClick={() => setImporting(true)}>{account ? 'Import again' : 'Import'}</button>} />

      <main>
        {/* Drawn the same with or without an account, so the record arriving after
            hydration fills it in rather than moving everything below. */}
        <section className="op-section">
          <h2>Profile</h2>
          <dl className="import-summary">
            <div><dt>Doctor</dt><dd>{account?.doctor ?? '—'}</dd></div>
            <div><dt>Level</dt><dd>{profile?.level ?? '—'}</dd></div>
            <div><dt>Account age</dt><dd>{profile?.registeredAt ? age(profile.registeredAt, Date.now()) : '—'}</dd></div>
            <div><dt>Assistant</dt><dd>{profile?.secretary ?? '—'}</dd></div>
          </dl>
          <p className="hint">
            {account
              ? `${profile?.registeredAt ? `Registered ${day(profile.registeredAt)}. ` : ''}Imported ${day(account.importedAt)}.${profile?.bio ? ` “${profile.bio}”` : ''}`
              : forgotten ? 'Forgotten on this browser.' : 'No account imported yet: use Import above.'}
          </p>
        </section>

        <section className="op-section">
          <h2>Collection</h2>
          <div className="account-counts">
            <Count label="Operators" owned={ownedOperators} total={released.size} href="/operators?owned=missing" linkLabel="Operators you don't have" />
            <Count label="Outfits" owned={ownedSkins} total={skinTotal} href="/skins?owned=missing" linkLabel="Outfits you don't have" />
          </div>
        </section>

        <section className="op-section">
          <h2>On this browser</h2>
          <p className="import-copy">
            The account is kept only in this browser. Forgetting it clears what the lists filter by; the Operator
            Planner keeps its roster and depot until you clear them there.
          </p>
          <button type="button" className="ghost btn-sm" disabled={!account} onClick={() => { writeAccount(null); setResult(null); setForgotten(true); }}>
            Forget this account
          </button>
        </section>
      </main>

      {importing && (
        <ImportDialog title="Import from the game" onClose={() => setImporting(false)}>
          <p className="import-copy">
            Import data directly from your Arknights (Global) account. Your login token is sent encrypted and is never
            read by Arkpedia itself; Arkpedia only receives your account data. For future imports, the login token is
            saved in your own browser, not on Arkpedia.
          </p>
          <p className="hint import-note">
            Importing replaces all your existing data and kicks you out of the game if you are logged in.
          </p>
          <GameSignIn server="en" idPrefix="account" onAccount={onAccount} />
          {result && (
            <p className="hint import-note" role="status">
              Imported {result.operators} operators and {result.materials} materials you hold. The{' '}
              <Link prefetch={false} href="/planner">Operator Planner</Link> starts your plans from them.{unheldSummary(result.unknown)}
            </p>
          )}
        </ImportDialog>
      )}
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
    skins: getAllSkins().filter((skin) => skin.skinId).map((skin) => ({ id: skin.skinId!, global: skin.sourceRegion !== 'CN' && !/^\[CN\]/.test(skin.release || '') })),
  } };
}, {
  bundledWhenUnpublished: true,
  tables: {
    'game-account-map': async () => checkGameAccountMap((await import('@/data/game-account-map.json')).default),
    'import-aliases': async () => checkImportAliases((await import('@/data/import-aliases.json')).default, checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default)),
    'material-catalogue': async () => checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default),
  },
});
