import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import ProfileCard from '@/components/account/ProfileCard';
import FriendCollection from '@/components/friends/FriendCollection';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import { useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { readRoster } from '@/lib/planner/roster';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { assistantCatalogue } from '@/lib/account/portraits';
import { FRIEND_STORAGE_KEY, friendFilename, makeFriendFile, parseFriendFile, shareableRoster, type FriendFile } from '@/lib/account/friendFile';
import type { FriendOperator, FriendSkin } from '@/lib/account/friendCatalogue';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { SERVERS } from '@/lib/account-import/yostar';
import styles from '@/components/friends/Friends.module.css';

interface Props { operators: FriendOperator[]; skins: FriendSkin[] }

export default function FriendsPage({ operators, skins }: Props) {
  const account = useAccount();
  const others = useOtherAccounts();
  const map = useReleaseTable<GameAccountMap>('game-account-map');
  const input = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const [friend, setFriend] = useState<FriendFile | null>(null);
  const [view, setView] = useState<'operators' | 'skins' | null>(null);
  const closeCollection = useCallback(() => setView(null), []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(FRIEND_STORAGE_KEY); if (raw) setFriend(parseFriendFile(raw)); } catch { /* A damaged or newer file can be replaced by importing again. */ }
  }, []);
  const { outfitArt, outfitNames } = useMemo(() => assistantCatalogue(map, skins), [map, skins]);

  function exportAccount() {
    if (!account) return;
    try {
      const shared = makeFriendFile(account, shareableRoster(account, Object.values(others), readRoster()));
      const url = URL.createObjectURL(new Blob([JSON.stringify(shared, null, 2)], {type:'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = friendFilename(account); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError(false); setMessage('Your profile and collection are ready to share.');
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'The account could not be exported.'); }
  }

  async function importFriend(file: File | undefined) {
    if (!file) return;
    const generation = ++importGeneration.current;
    setError(false); setMessage('Reading friend…');
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a friend file smaller than 4 MB.');
      const shared = parseFriendFile(await file.text());
      if (generation !== importGeneration.current) return;
      setFriend(shared); setView(null);
      try { localStorage.setItem(FRIEND_STORAGE_KEY, JSON.stringify(shared)); } catch { /* Still viewable when browser storage is full. */ }
      setMessage(`Imported ${shared.account.doctor ?? 'your friend'}.`);
    } catch (reason) {
      if (generation !== importGeneration.current) return;
      setError(true); setMessage(reason instanceof Error ? reason.message : 'The friend file could not be read.');
    }
  }

  return <>
    <Head><title>Friends — Arkpedia</title><meta name="robots" content="noindex" /></Head>
    <PageHeader eyebrow="Rhodes Island // Community" title="Friends" sub="Trade account files. Meet the Doctor, browse their operators and admire their skins."
      actions={<div className={styles.actions}>
        <button type="button" className="primary btn-sm" onClick={() => input.current?.click()}>Import a friend</button>
        {account ? <button type="button" className="btn-sm" onClick={exportAccount}>Export my account</button>
          : <Link className="btn btn-sm" href="/account">Import my account</Link>}
      </div>} />
    <main>
      <input ref={input} className={styles.file} type="file" accept=".json,application/json" aria-label="Friend account file" onChange={event => {
        void importFriend(event.currentTarget.files?.[0]); event.currentTarget.value = '';
      }} />
      <p className={`hint ${styles.status}`} role={error ? 'alert' : 'status'}>{message || 'Shared files contain your profile, operators and skins. Your friend stays separate from your account and planners.'}</p>
      {friend ? <section className="op-section">
        <div className={styles.meta}><h2>Friend profile</h2><span className="hint">{SERVERS[friend.account.server].label} · Account imported {new Date(friend.account.importedAt).toLocaleDateString('en-GB')}</span></div>
        <div className={styles.profile}><ProfileCard key={`${friend.exportedAt}-${friend.account.doctor}`} account={friend.account} map={map} outfits={friend.account.skins.length}
          outfitArt={outfitArt} outfitNames={outfitNames} onOperators={() => setView('operators')} onSkins={() => setView('skins')} /></div>
        <div className={styles.actions}>
          <button type="button" className="btn-sm" aria-haspopup="dialog" onClick={() => setView('operators')}>Operators</button>
          <button type="button" className="btn-sm" aria-haspopup="dialog" onClick={() => setView('skins')}>Skins</button>
        </div>
      </section> : <section className={styles.empty}><h2>No friend imported yet</h2><p className="hint">Ask a friend to export their account here, then open their JSON file.</p></section>}
    </main>
    {friend && view && <FriendCollection key={view} friend={friend} operators={operators} skins={skins} view={view} onClose={closeCollection} />}
  </>;
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/friends', async () => {
  const [{ getAllSkins }, { getAllOperators }, { friendOperators }] = await Promise.all([
    import('@/lib/skins/skins'), import('@/lib/operators/operators'), import('@/lib/account/friendCatalogue'),
  ]);
  const map = await DATA_DIALOG_TABLES['game-account-map']();
  return { props: {
    operators: friendOperators(map, getAllOperators()),
    skins: getAllSkins().flatMap(skin => skin.skinId ? [{id:skin.skinId,name:skin.name,model:skin.model,series:skin.series,image:skin.image}] : []),
  } };
}, { bundledWhenUnpublished: true, tables: { 'game-account-map': DATA_DIALOG_TABLES['game-account-map'] }, finalize: fillAccountMap });
