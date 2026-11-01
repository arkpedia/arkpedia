import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { normalizeUsername, type AccountProfile } from '@/lib/cloud-account/profile';
import { SERVER_IDS, SERVERS, type ServerId } from '@/lib/account-import/yostar';
import StyledSelect from '@/components/ui/StyledSelect';
import styles from './CloudAccountPanel.module.css';

export default function AccountProfileForm({ owner, profile, onSaved, onCancel, gameSync = false, paused = false, id = 'setup', onboarding = false }: {
  owner: string; profile: AccountProfile | null; onSaved: () => Promise<void>; onCancel?: () => void; gameSync?: boolean; paused?: boolean; id?: string; onboarding?: boolean;
}) {
  const imported = useAccount();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [friendTag, setFriendTag] = useState(profile?.friendTag ?? '');
  const [server, setServer] = useState<ServerId>(profile?.friendServer ?? imported?.server ?? 'en');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [hint, setHint] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    setHint('');
    if (!username) { setAvailability('idle'); return; }
    try { normalizeUsername(username); }
    catch (error) { setAvailability('invalid'); setHint((error as Error).message); return; }
    setAvailability('checking');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/account-profile?username=${encodeURIComponent(username)}`, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setAvailability(result.available ? 'available' : 'taken');
        setHint(result.available ? 'Username available' : 'That username is taken. Try another name or number.');
      } catch (error) {
        if (!controller.signal.aborted) { setAvailability('invalid'); setHint(error instanceof Error ? error.message : 'Could not check availability. Try again.'); }
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [username]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || availability !== 'available') return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/account-profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, username, friendTag, friendServer: friendTag.trim() ? server : null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'Your profile could not be saved.'); }
    finally { setSaving(false); }
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}>
    {!profile && <><h3>Choose your Arkpedia username</h3><p>{onboarding ? "Your Google or Discord name stays private. You can add a profile picture and friend tag later." : "Your Google or Discord name won’t be used. Your existing logins and saves stay with this account."}</p></>}
    <label htmlFor={`${id}-username`}>Arkpedia username</label>
    <input type="text" id={`${id}-username`} autoComplete="username" value={username} maxLength={80} required disabled={saving}
      placeholder="Doctor#1234 or a name of your choice" aria-describedby={`${id}-username-hint ${id}-availability`}
      aria-invalid={availability === 'taken' || availability === 'invalid'} onChange={event => { setUsername(event.target.value); setError(''); }} />
    <p id={`${id}-username-hint`} className="hint">Unique on Arkpedia, ignoring letter case. 3–40 characters; non-Latin names are welcome.</p>
    <p id={`${id}-availability`} className="hint" role="status">{availability === 'checking' ? 'Checking availability…' : hint}</p>
    {imported?.doctor && <div className={styles.suggestion}>
      <span>Use your imported Doctor name?</span>
      <button type="button" className="ghost btn-sm" disabled={saving} onClick={() => setUsername(imported.doctor!)}>Use {imported.doctor}</button>
    </div>}
    {!onboarding && <details open={!!profile?.friendTag}>
      <summary>Arknights friend tag (optional)</summary>
      <div className={styles.form}>
        <p className="hint">Keep your in-game name and server separately for friend sharing. This is private and does not verify game-account ownership.</p>
        <label htmlFor={`${id}-friend-tag`}>Arknights name and #number</label>
        <input type="text" id={`${id}-friend-tag`} value={friendTag} placeholder="Doctor#1234" maxLength={80} disabled={saving} onChange={event => setFriendTag(event.target.value)} />
        <StyledSelect label="Friend tag server" value={server} onChange={value => setServer(value as ServerId)} disabled={saving}
          options={SERVER_IDS.map(value => ({ value, label: SERVERS[value].label }))} />
        {imported?.doctor && <button type="button" className="ghost btn-sm" disabled={saving}
          onClick={() => { setFriendTag(imported.doctor!); setServer(imported.server); }}>Use imported friend tag</button>}
      </div>
    </details>}
    {!profile && !onboarding && <p className="hint">{paused ? 'Cloud saving is paused. Choosing a username will not resume it.' : gameSync
      ? 'Your existing saving choices are kept. Control personal data, pull history and imported game snapshots separately in Account settings → Saving.'
      : 'Personal settings and plans save by default. Pull history and imported game snapshots each need a separate opt-in under Account settings → Saving.'}</p>}
    {!profile && onboarding && <p className="hint">{paused ? 'Cloud saving stays paused.' : 'Nothing syncs until you confirm your saving choices next.'}</p>}
    {error && <p role="alert" className="notice notice-danger">{error}</p>}
    <div className={styles.actions}><button type="submit" className="primary btn-sm" disabled={saving || availability !== 'available'}>
      {saving ? 'Saving…' : profile ? 'Save profile' : onboarding ? 'Continue' : 'Finish setup'}</button>
      {onCancel && <button type="button" className="ghost btn-sm" disabled={saving} onClick={onCancel}>{onboarding ? 'Not now' : 'Sign out'}</button>}</div>
  </form>;
}
