import { useState } from 'react';
import { accountClient } from '@/lib/cloud-account/client';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import styles from './CloudAccountPanel.module.css';
import { useRouter } from 'next/router';

export default function CloudAccountPanel() {
  const sync = useCloudSync();
  const router = useRouter();
  const [working, setWorking] = useState(false), [message, setMessage] = useState('');
  const [pendingConsent, setPendingConsent] = useState<boolean | null>(null);
  async function act(action: () => Promise<unknown>) {
    if (working) return;
    setWorking(true); setMessage('');
    try { await action(); }
    catch { setMessage('The request could not be completed. Try again.'); }
    finally { setWorking(false); }
  }
  async function login(provider: 'google' | 'discord', link = false) {
    const body = { provider, callbackURL: '/account', errorCallbackURL: '/account?signin=failed' };
    const result = link ? await accountClient.linkSocial(body) : await accountClient.signIn.social(body);
    if (result.error) setMessage('Sign-in could not finish. If you already use another provider, sign in with it first and link this one from your account.');
  }
  return <section className="op-section" aria-labelledby="cloud-account-title">
    <h2 id="cloud-account-title">Arkpedia account</h2>
    {router.query.signin === 'failed' && <p role="alert">Sign-in could not finish. Try again with your existing provider. To add another provider, sign in first and link it under Account options.</p>}
    <p>Save your music likes and playlists, plans, story progress and preferences across devices.</p>
    {sync.status === 'loading' && <p role="status">Checking sign-in…</p>}
    {sync.status === 'unavailable' && <p>Cloud accounts are not available on this deployment yet. Your browser saves and game import still work.</p>}
    {!sync.remote && sync.status === 'signed-out' && <>
      <p>Sign in to create an account or return to your saves. Arkpedia’s login is separate from your Arknights sign-in.</p>
      <div className={styles.actions}>
        {(['google', 'discord'] as const).map(provider => sync.providers.includes(provider) && <button type="button" key={provider} disabled={working}
          onClick={() => void act(() => login(provider))}>Continue with {provider === 'google' ? 'Google' : 'Discord'}</button>)}
      </div>
      {!sync.providers.length && <p>Login providers are still being configured.</p>}
    </>}
    {sync.remote && <>
      <p>Signed in as <strong>{sync.remote.user.name}</strong>.</p>
      {sync.status === 'ready' && <button type="button" disabled={working} onClick={() => void act(sync.refresh)}>Save now</button>}
      <p>Personal saves include your chosen plans and base setups. Imported ownership, inventory and operator builds stay in this browser unless you enable game-data storage below. Imported wallet values and planner starting levels are omitted from personal-only saves.</p>
      <label className="check"><input type="checkbox" checked={pendingConsent ?? sync.remote.gameSync} disabled={working}
        onChange={event => { const enabled = event.target.checked; if (!enabled && !window.confirm('Stop storing imported game data and delete it from your active cloud save? It will remain in this browser.')) return;
          setPendingConsent(enabled); void act(async () => { try { await sync.consent(enabled); } finally { setPendingConsent(null); } }); }} />
        Save imported game data to my Arkpedia account</label>
      <p className="hint">Includes the supported imported profile, operators and builds, skins, wallet, depot, stage clears, medals, base snapshot and pull history. Yostar email, codes and login tokens are never uploaded. Saving a Yostar sign-in remains a separate browser-only option.</p>
      {sync.status === 'choice' && <div>
        <p>Use this browser to replace the cloud save, or use the cloud save to replace the synced data in this browser. Loading the cloud copy reloads the page. Export first to keep a backup.</p>
        <div className={styles.actions}>
          <button type="button" disabled={working} onClick={() => void act(() => sync.choose('browser'))}>Use this browser’s data</button>
          <button type="button" disabled={working} onClick={() => void act(() => sync.choose('cloud'))}>Use cloud data</button>
        </div>
      </div>}
      <details><summary>Account options</summary>
        <p>Link a second provider while signed in to use either login. Your saves stay on this Arkpedia account.</p>
        <div className={styles.actions}>
          {(['google', 'discord'] as const).map(provider => sync.providers.includes(provider) && <button type="button" key={provider} disabled={working}
            onClick={() => void act(() => login(provider, true))}>Link {provider === 'google' ? 'Google' : 'Discord'}</button>)}
          <button type="button" disabled={working} onClick={() => void act(async () => {
            sync.pause();
            const result = await accountClient.signOut();
            if (result.error) { window.location.reload(); return; }
            window.location.reload();
          })}>Sign out</button>
          <button type="button" disabled={working} onClick={() => { if (window.confirm('Delete all saved cloud data? This keeps your Arkpedia login and this browser’s local data.')) void act(sync.erase); }}>Delete cloud saves</button>
          <button type="button" disabled={working} onClick={() => { if (window.confirm('Permanently delete your Arkpedia account, linked logins and cloud saves? Browser-local data stays here. You may need to sign in again first.')) void act(async () => {
            sync.pause();
            const result = await accountClient.deleteUser({ callbackURL: '/account' });
            if (result.error) { setMessage('Please sign in again to confirm account deletion.'); return; }
            window.location.reload();
          }); }}>Delete Arkpedia account</button>
        </div>
        <p className="hint">Signing out leaves browser data on this device. “Forget everything” under Import / export clears local data. Deleted cloud data can remain in recovery backups until their retention expires.</p>
      </details>
    </>}
    {(sync.status === 'ready' || sync.status === 'choice' || sync.status === 'error') && <p role="status">{sync.message}</p>}
    {sync.status === 'error' && <button type="button" disabled={working} onClick={() => void act(sync.refresh)}>Retry sync</button>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
