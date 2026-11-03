import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageMeta from '@/components/layout/PageMeta';
import type { GetStaticProps } from 'next';
import DataLink from '@/components/account/DataLink';
import PageHeader from '@/components/ui/PageHeader';
import ProfileCard from '@/components/account/ProfileCard';
import ImportDialog from '@/components/account/ImportDialog';
import InfoPopover from '@/components/ui/InfoPopover';
import { ICONS } from '@/components/layout/NavIcons';
import FriendCollection from '@/components/friends/FriendCollection';
import FriendCard, { FriendSupports } from '@/components/friends/FriendCard';
import { withFriendDynamicArt } from '@/lib/skins/dynamicArtFallback';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import { useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { readRoster } from '@/lib/planner/roster';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { assistantCatalogue, avatarSources, profileArtPath } from '@/lib/account/portraits';
import { FRIEND_STORAGE_KEY, FRIENDS_STORAGE_KEY, friendKey, friendFilename, makeFriendFile, parseFriendFile, shareableRoster, type FriendFile } from '@/lib/account/friendFile';
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
  const [friends, setFriends] = useState<FriendFile[]>([]);
  const [friend, setFriend] = useState<FriendFile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<'operators' | 'skins' | null>(null);
  const closeCollection = useCallback(() => { setView(null); setProfileOpen(false); requestAnimationFrame(() => opener.current?.focus({ preventScroll: true })); }, []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FRIENDS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.version === 1 && Array.isArray(parsed.friends)) {
        const loaded: FriendFile[] = [];
        for (const entry of parsed.friends.slice(0, 50)) { try { loaded.push(parseFriendFile(JSON.stringify(entry))); } catch { /* Keep other valid friends. */ } }
        setFriends(loaded);
      } else {
        const legacy = localStorage.getItem(FRIEND_STORAGE_KEY);
        if (legacy) setFriends([parseFriendFile(legacy)]);
      }
    } catch { /* Damaged records can be replaced by importing again. */ }
  }, []);
  const { outfitArt, outfitNames } = useMemo(() => assistantCatalogue(map, skins), [map, skins]);

  function exportAccount() {
    if (!account) return;
    try {
      const shared = makeFriendFile(account, shareableRoster(account, Object.values(others), readRoster()));
      const url = URL.createObjectURL(new Blob([JSON.stringify(shared)], {type:'application/json'}));
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
      const next = [...friends.filter(entry => friendKey(entry) !== friendKey(shared)), shared];
      if (next.length > 50) throw new Error('Remove a friend before importing more than 50 profiles.');
      const saved = JSON.stringify({ version: 1, friends: next });
      if (saved.length > MAX_IMPORT_BYTES) throw new Error('The saved friend list is too large. Remove a profile first.');
      setFriends(next); setFriend(null); setView(null); setProfileOpen(false);
      let persisted = true;
      // The list is the one record; the single-friend key before it is read only to migrate.
      try { localStorage.setItem(FRIENDS_STORAGE_KEY, saved); } catch { persisted = false; }
      setMessage(`Imported ${shared.account.doctor ?? 'your friend'}.${persisted ? '' : ' This tab only: browser storage could not save the profile.'}`);
    } catch (reason) {
      if (generation !== importGeneration.current) return;
      setError(true); setMessage(reason instanceof Error ? reason.message : 'The friend file could not be read.');
    }
  }

  return <>
    <PageMeta title="Friends" description="Friend profiles you have imported: their operators, outfits and support units." path="/friends" noindex />
    <PageHeader eyebrow="Rhodes Island // Account" title="Friends" sub="Trade account files. Meet the Doctor, browse their operators and admire their skins."
      actions={<div className={styles.actions}>
        <button type="button" className="primary btn-sm" onClick={() => input.current?.click()}>Import a friend</button>
        <button type="button" className="ghost btn-sm" disabled={!account} onClick={exportAccount} title={!account ? 'Import your own Arknights account on My account first' : undefined}>Export my account</button>
        <InfoPopover label="Friend sharing details">
          <p>Shared files contain your profile, operators and skins. Your friend stays separate from your account and planners.</p>
          <p>Pull history, resources, credentials and unrelated planner saves are excluded.</p>
          {!account && <><p>Import your own Arknights account to enable Export my account.</p><DataLink /></>}
        </InfoPopover>
      </div>} />
    <main>
      <input ref={input} className={styles.file} type="file" accept=".json,application/json" aria-label="Friend account file" onChange={event => {
        void importFriend(event.currentTarget.files?.[0]); event.currentTarget.value = '';
      }} />
      <p className={styles.status} role={error ? 'alert' : 'status'} hidden={!message}>{message}</p>
      {friends.length ? <section className={`op-section ${styles.friendList}`} aria-label="Imported friends">
        {friends.map(entry => {
          const show = (kind: 'profile' | 'operators' | 'skins', trigger: HTMLElement) => { opener.current = trigger; setFriend(entry); setProfileOpen(kind === 'profile'); setView(kind === 'profile' ? null : kind); };
          const name = entry.account.doctor ?? 'Friend';
          const card = entry.account.profile?.nameCard ?? 'nc_rhodes_default';
          const variants = map.nameCardVariants?.[card];
          const strip = `${card}-strip${variants ? `-${Math.min(entry.account.profile?.nameCardVariant ?? 0, variants - 1)}` : ''}`;
          return <FriendCard key={friendKey(entry)} name={name} background={profileArtPath('profile-namecards', strip)} avatar={avatarSources(entry.account.profile ?? {}, map.chars, outfitNames)[0]}
            onProfile={trigger=>show('profile',trigger)} metadata={<><span className="hint">{SERVERS[entry.account.server].label}{entry.account.profile?.level != null ? ` · Level ${entry.account.profile.level}` : ''}</span><span className="hint">{entry.account.operators.length} operators · {entry.account.skins.length} skins</span></>}
            supports={<FriendSupports units={entry.account.profile?.supports??[]} map={map} />}
            actions={<>
              <button type="button" className="ghost btn-sm" aria-label={`Show ${name}'s operators`} aria-haspopup="dialog" onClick={event => show('operators', event.currentTarget)}><span className="site-nav-icon" aria-hidden="true">{ICONS.roster}</span>Operators</button>
              <button type="button" className="ghost btn-sm" aria-label={`Show ${name}'s skins`} aria-haspopup="dialog" onClick={event => show('skins', event.currentTarget)}><span className="site-nav-icon" aria-hidden="true">{ICONS.skins}</span>Skins</button>
            </>} />;
        })}
      </section> : <section className={styles.empty}><h2>No friend imported yet</h2><p className="hint">Ask a friend to export their account here, then open their JSON file.</p></section>}
    </main>
    {friend && profileOpen && <ImportDialog title={`${friend.account.doctor ?? 'Friend'} · Profile`} className={styles.profileDialog} onClose={closeCollection}>
      <div className={styles.profile}><ProfileCard account={friend.account} map={map} outfits={friend.account.skins.length} outfitArt={outfitArt} outfitNames={outfitNames} onOperators={() => { setProfileOpen(false); setView('operators'); }} onSkins={() => { setProfileOpen(false); setView('skins'); }} /></div>
      <button type="button" className="ghost btn-sm" onClick={() => {
        const next = friends.filter(entry => friendKey(entry) !== friendKey(friend));
        try { localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify({ version: 1, friends: next })); setFriends(next); closeCollection(); }
        catch { setError(true); setMessage('This browser could not save the updated friend list.'); }
      }}>Remove imported friend</button>
    </ImportDialog>}
    {friend && view && <FriendCollection key={view} friend={friend} operators={operators} skins={skins} view={view} onClose={closeCollection} />}
  </>;
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/friends', async () => {
  const [{ getAllSkins }, { getAllOperators }, { friendOperators }] = await Promise.all([
    import('@/lib/skins/skins'), import('@/lib/operators/operators'), import('@/lib/account/friendCatalogue'),
  ]);
  const map = await DATA_DIALOG_TABLES['game-account-map']();
  return { props: await withFriendDynamicArt({
    operators: friendOperators(map, getAllOperators()),
    skins: getAllSkins().flatMap(skin => skin.skinId ? [{id:skin.skinId,name:skin.name,model:skin.model,series:skin.series,image:skin.image}] : []),
  }) };
}, { bundledWhenUnpublished: true, tables: { 'game-account-map': DATA_DIALOG_TABLES['game-account-map'] }, finalize: async props => withFriendDynamicArt(await fillAccountMap(props)) });
