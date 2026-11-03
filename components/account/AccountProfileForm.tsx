import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { normalizeUsername, type AccountProfile } from '@/lib/cloud-account/profile';
import { SERVERS } from '@/lib/account-import/yostar';
import InfoPopover from '@/components/ui/InfoPopover';
import styles from './CloudAccountPanel.module.css';

export default function AccountProfileForm({ owner, profile, onSaved, onCancel, gameSync = false, paused = false, id = 'setup', onboarding = false, onSwitchAccount, busy = false }: {
  owner: string; profile: AccountProfile | null; onSaved: () => Promise<void>; onCancel?: () => void; gameSync?: boolean; paused?: boolean; id?: string; onboarding?: boolean; onSwitchAccount?: () => void; busy?: boolean;
}) {
  const imported = useAccount();
  const friendTag = imported?.doctor ?? profile?.friendTag ?? '';
  const friendServer = imported?.doctor ? imported.server : profile?.friendServer ?? null;
  const [username, setUsername] = useState(profile?.username ?? '');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [hint, setHint] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    setHint('');
    if (profile && username === profile.username) { setAvailability('available'); return; }
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
  }, [username, profile]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || busy || availability !== 'available') return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/account-profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, username, friendTag, friendServer }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'Your profile could not be saved.'); }
    finally { setSaving(false); }
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}>
    {!profile && <><h3>Choose your Arkpedia username</h3><p>{onboarding ? "Choose how you appear on Arkpedia. Your Google or Discord name stays private." : "Your Google or Discord name won’t be used. Your existing logins and saves stay with this account."}</p></>}
    {profile && <p>Your name on Arkpedia. This does not change your in-game name.</p>}
    <div className={styles.choiceHeading}><label htmlFor={`${id}-username`}>Arkpedia username</label>
      <InfoPopover label="Username rules"><p>Use 3–40 characters: letters, numbers, spaces, dots, underscores or hyphens. A #number can go at the end.</p><p>Names must be unique, regardless of capitalisation. You can use letters from any language.</p></InfoPopover>
    </div>
    <input type="text" id={`${id}-username`} autoComplete="username" value={username} maxLength={80} required disabled={saving || busy}
      placeholder="Choose a username" aria-describedby={`${id}-availability`}
      aria-invalid={availability === 'taken' || availability === 'invalid'} onChange={event => { setUsername(event.target.value); setError(''); }} />
    <p id={`${id}-availability`} className={`hint ${styles.availability}`} role="status">{availability === 'checking' ? 'Checking availability…' : hint}</p>
    {imported?.doctor && username !== imported.doctor && <div className={styles.suggestion}>
      <button type="button" className="ghost btn-sm" disabled={saving || busy} onClick={() => setUsername(imported.doctor!)}>Use game name: {imported.doctor}</button>
    </div>}
    {!onboarding && <div className={styles.welcome}>
      <div className={styles.choiceHeading}><span>Arknights friend tag</span><InfoPopover label="About your friend tag"><p>Read from your latest game import. To update it, import again after changing your name in Arknights.</p><p>Your tag is only listed in the support finder if you enable sharing under Community.</p></InfoPopover></div>
      <p>{friendTag && friendServer ? <><strong>{friendTag}</strong> · {SERVERS[friendServer].label}</> : 'Import your game account to add your friend tag.'}</p>
    </div>}
    {!profile && !onboarding && <p className="hint">{paused ? 'Cloud saving is paused. Choosing a username will not resume it.' : gameSync
      ? 'Your existing saving choices are kept. Control personal data, pull history and imported game snapshots separately in Account settings → Saving & sharing.'
      : 'Personal settings and plans save by default. Pull history and imported game snapshots each need a separate opt-in under Account settings → Saving & sharing.'}</p>}
    {!profile && onboarding && <p className="hint">{paused ? 'Cloud saving stays paused.' : 'Nothing syncs until you confirm your saving choices next.'}</p>}
    {error && <p role="alert" className="notice notice-danger">{error}</p>}
    <div className={styles.actions}><button type="submit" className="primary btn-sm" disabled={saving || busy || availability !== 'available'}>
      {saving ? 'Saving…' : profile ? 'Save profile' : onboarding ? 'Continue' : 'Finish setup'}</button>
      {onSwitchAccount && <button type="button" className="ghost btn-sm" disabled={saving || busy} onClick={onSwitchAccount}>{busy ? 'Signing out…' : 'Use another account'}</button>}
      {onCancel && <button type="button" className="ghost btn-sm" disabled={saving || busy} onClick={onCancel}>{onboarding ? 'Not now' : 'Sign out'}</button>}</div>
  </form>;
}
