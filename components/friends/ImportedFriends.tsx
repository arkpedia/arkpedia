import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataLink from '@/components/account/DataLink';
import ProfileCard from '@/components/account/ProfileCard';
import ImportDialog from '@/components/account/ImportDialog';
import InfoPopover from '@/components/ui/InfoPopover';
import { ICONS } from '@/components/layout/NavIcons';
import FriendCollection from '@/components/friends/FriendCollection';
import FindFriends from '@/components/friends/FindFriends';
import ProfileLink from '@/components/friends/ProfileLink';
import SharedFriendCard from '@/components/friends/SharedFriendCard';
import SharedProfileDialog from '@/components/friends/SharedProfile';
import { useSharedFriends } from '@/lib/friends/useSharedFriends';
import { FRIEND_LINKS_KEY, parseFriendLinks } from '@/lib/friends/sharedProfile';
import FriendCard, { FriendSupports } from '@/components/friends/FriendCard';
import { useReleaseTable } from '@/lib/content/context';
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

export default function ImportedFriends({ operators, skins }: Props) {
  const shared = useSharedFriends();
  const [directoryOpen,setDirectoryOpen] = useState(false);
  const [sharedId,setSharedId] = useState<string|null>(null);
  const closeDirectory = useCallback(()=>setDirectoryOpen(false),[]);
  const closeShared = useCallback(()=>setSharedId(null),[]);
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
  const announce = useCallback((text:string,failed=false)=>{setMessage(text);setError(failed);},[]);
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
      let linkedCount=0;try{linkedCount=parseFriendLinks(localStorage.getItem(FRIEND_LINKS_KEY)).length;}catch{/* Manual imports still work in this tab when storage is blocked. */}
      if (next.length + linkedCount > 50) throw new Error('Remove a friend before importing more than 50 profiles.');
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
    <div className={`${styles.actions} ${styles.toolbar}`}>
      <div className={styles.toolbarGroup}><button type="button" className="primary btn-sm" aria-haspopup="dialog" onClick={()=>setDirectoryOpen(true)}>Find Friends</button><ProfileLink onMessage={announce} /></div>
      <div className={styles.toolbarGroup}>
      <button type="button" className="btn-sm" onClick={() => input.current?.click()}>Import a friend</button>
      <button type="button" className="btn-sm" disabled={!account} onClick={exportAccount} title={!account ? 'Import your own Arknights account on My account first' : undefined}>Export my account</button>
      <InfoPopover label="Friend sharing details">
        <p>Find Friends lists opted-in players. A full collection is visible only when that player explicitly publishes it. Saved public links are checked again when you open them.</p>
        <p>Shared files contain your profile, operators and skins. Manual sharing still works: ask a friend to export their account, then import their JSON file here. Import a newer export to update it. Friends are kept in this browser, separate from your account and planners.</p>
        <p>Pull history, resources, credentials and unrelated planner saves are excluded.</p>
        {!account && <><p>Import your own Arknights account to enable Export my account.</p><DataLink /></>}
      </InfoPopover>
      </div>
    </div>
      <input ref={input} className={styles.file} type="file" accept=".json,application/json" aria-label="Friend account file" onChange={event => {
        void importFriend(event.currentTarget.files?.[0]); event.currentTarget.value = '';
      }} />
      <p className={styles.status} role={error ? 'alert' : 'status'} hidden={!message}>{message}</p>
      {shared.error&&<p role="alert">{shared.error} <button type="button" className="btn-sm" onClick={shared.retry}>Retry shared friends</button></p>}
      {!!shared.ids.length&&<section className={`op-section ${styles.friendList}`} aria-label="Shared friends">{shared.ids.map(id=>{
        const summary=shared.profiles.get(id);
        const remove=()=>{try{shared.remove(id);announce("Friend removed.");}catch{announce("This browser could not save the updated friend list.",true);}};
        return summary?<SharedFriendCard key={id} summary={summary} map={map} operators={operators} onOpen={()=>setSharedId(id)} actions={<><button type="button" className="ghost btn-sm" aria-haspopup="dialog" disabled={shared.checking} onClick={()=>setSharedId(id)}>View profile</button><button type="button" className="btn-sm" onClick={remove}>Remove friend</button></>} />:<div key={id} className="panel"><p>{shared.checking?"Checking shared friend…":"This friend’s shared profile is unavailable."}</p><button type="button" className="btn-sm" onClick={remove}>Remove friend</button></div>;
      })}</section>}
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
      </section> : !shared.ids.length&&<section className={styles.empty}><h2>No friends yet</h2><p className="hint">Find an opted-in player, or import a friend’s exported account file.</p></section>}
    {directoryOpen&&<FindFriends operators={operators} saved={shared.ids} onAdd={shared.add} onOpen={setSharedId} onClose={closeDirectory} />}
    {sharedId&&<SharedProfileDialog key={sharedId} id={sharedId} operators={operators} skins={skins} onClose={closeShared} />}
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

