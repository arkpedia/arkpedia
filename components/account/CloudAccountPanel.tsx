import { useEffect, useRef, useState, useId, Fragment, type ReactNode } from 'react';
import AudioSettings from '@/components/music/AudioSettings';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { accountReturnPath } from '@/lib/cloud-account/navigation';
import { accountClient } from '@/lib/cloud-account/client';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { BACKUP_STORES } from '@/lib/account/backup';
import ImportDialog from './ImportDialog';
import InfoPopover from '@/components/ui/InfoPopover';
import AccountProfileForm from './AccountProfileForm';
import ProviderIcon from './ProviderIcon';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import styles from './CloudAccountPanel.module.css';

type Setting = 'audio' | 'profile' | 'picture' | 'saving' | 'logins' | 'data';
type Confirmation = 'cloud' | 'account' | 'revoke' | 'history' | 'personal' | null;
type Category = 'gameSync' | 'historySync' | 'personalSync';
const label = (provider: string) => provider === 'google' ? 'Google' : 'Discord';
const SYNC_NOW_HINT = 'Optional: check for changes now. Selected data syncs automatically while Arkpedia is open.';
function SaveSummary({ data }: { data: Record<string, unknown> }) {
  const labels = BACKUP_STORES.filter(store => data[store.key] !== undefined).map(store => store.label);
  return <p className="hint">{labels.length ? labels.join(', ') : 'Preferences only, or no saved data yet'}</p>;
}

function SaveChoice({ data, message, working, onChoose }: { data: Record<string, unknown>; message: string; working: boolean; onChoose: (source: 'browser' | 'cloud') => void }) {
  return <div className={styles.form}>
        <p>{message} The copy you select replaces the synced data in the other location.</p>
        <div className={styles.copies}>
          <div><h3>This browser</h3><p className="hint">Keep what you have on this device and replace the cloud copy.</p>
            <button type="button" className="ghost btn-sm" disabled={working} onClick={() => onChoose('browser')}>Use this browser’s data</button></div>
          <div><h3>Cloud save</h3><SaveSummary data={data} />
            <button type="button" className="ghost btn-sm" disabled={working} onClick={() => onChoose('cloud')}>Use cloud data</button></div>
        </div>
        <p className="hint">Pull archives merge separately from this save choice. History linked to another Arkpedia account is uploaded only if you choose this browser’s data. Import / export can back up this browser before you choose. Music keeps playing during a restore.</p>
      </div>;
}

export default function CloudAccountPanel({ onOpenData, hideSettingsButton = false, onOpenSettings, pictureContent, initialSettings, settingsOnly = false, onboarding = false, onSettingsClose }: { onOpenData?: () => void; hideSettingsButton?: boolean; onOpenSettings?: () => void; pictureContent?: ReactNode; initialSettings?: Setting; settingsOnly?: boolean; onboarding?: boolean; onSettingsClose?: () => void }) {
  const sync = useCloudSync(), router = useRouter();
  const headingId = useId();
  const [working, setWorking] = useState(false), [message, setMessage] = useState('');
  const [choices, setChoices] = useState({ personalSync: false, historySync: false, gameSync: false });
  const [pendingConsent, setPendingConsent] = useState<Category | null>(null);
  const [reauth, setReauth] = useState(false);
  const [settings, setSettings] = useState<Setting | null>(initialSettings ?? null), [confirm, setConfirm] = useState<Confirmation>(null);
  const [typed, setTyped] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const remote = sync.remote;
  useEffect(() => { if (confirm) { setTyped(''); cancel.current?.focus(); } }, [confirm]);
  const userId = remote?.user.id;
  useEffect(() => {
    if (!settingsOnly || onboarding) return;
    if (router.query.confirm === 'delete' && userId) { setSettings('data'); setConfirm('account'); }
    else if (userId && ['profile', 'saving', 'logins'].includes(String(router.query.settings))) setSettings(router.query.settings as Setting);
  }, [router.query.confirm, router.query.settings, userId, settingsOnly, onboarding]); // A provider return never submits deletion.
  async function act(action: () => Promise<unknown>) {
    if (working) return;
    setWorking(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be completed. Try again.'); }
    finally { setWorking(false); }
  }
  async function login(provider: 'google' | 'discord', mode: 'sign-in' | 'link' | 'delete' | 'confirm' = 'sign-in') {
    const body = { provider, callbackURL: mode === 'delete' ? '/account?confirm=delete' : mode === 'link' || mode === 'confirm' ? '/account?settings=logins' : accountReturnPath(router.asPath), errorCallbackURL: accountReturnPath(router.asPath, true) };
    const result = mode === 'link' ? await accountClient.linkSocial(body) : await accountClient.signIn.social(body);
    if (result.error?.code === 'SESSION_NOT_FRESH') { setReauth(true); throw new Error('Confirm with an existing login, then try again.'); }
    if (result.error) throw new Error('Sign-in could not finish. Use your existing login first, then link another provider in Account settings.');
  }
  async function signOut() {
    sync.pause();
    let result;
    try { result = await accountClient.signOut(); } finally { await sync.resume(); }
    if (result.error) throw new Error('Sign-out could not finish. Please try again.');
    setSettings(null); onSettingsClose?.();
  }
  function closeSettings() { if (!working) { setSettings(null); setConfirm(null); setMessage(''); onSettingsClose?.(); } }
  if (sync.status === 'unavailable') return null;
  const confirmationTitle = confirm === 'cloud' ? 'Delete cloud saves?' : confirm === 'revoke' ? 'Stop saving imported game data?' : confirm === 'history' ? 'Delete cloud pull archive?' : confirm === 'personal' ? 'Stop saving personal data?' : 'Delete Arkpedia account?';
  const welcome = !onboarding && settingsOnly && (!remote?.profile || sync.status === 'choice' || sync.status === 'error');
  const Container = settingsOnly ? Fragment : 'section';
  return <Container {...(settingsOnly ? {} : { className: 'op-section', 'aria-labelledby': headingId, 'aria-busy': working })}>
    {!settingsOnly && <>
    <div className={styles.heading}>
      <h2 id={headingId}>Arkpedia account</h2>
      {remote && !hideSettingsButton && <button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={() => onOpenSettings ? onOpenSettings() : setSettings(remote.profile ? 'profile' : 'logins')}>Account settings</button>}
    </div>
    {router.query.signin === 'failed' && <p role="alert" className="notice notice-danger">Sign-in could not finish. Try your existing provider, then link another login in Account settings.</p>}
    {sync.status === 'loading' && <p role="status">Checking sign-in…</p>}
    {!remote && sync.status === 'signed-out' && <div className={styles.welcome}><p>Keep your settings and plans across devices.</p><div className={styles.actions}><button type="button" onClick={onOpenSettings}>Log in</button></div></div>}
    {remote && !remote.profile && <div className={styles.welcome}><p>Finish setting up your Arkpedia account.</p><div className={styles.actions}><button type="button" onClick={onOpenSettings}>Continue account setup</button></div></div>}
    {remote?.profile && <>
      <div className={styles.identity}><strong>{remote.profile.username}</strong><span className="hint" role="status">{sync.status === 'ready' ? (remote.personalSync || remote.historySync || remote.gameSync ? 'Auto-save on' : 'Cloud saving off') : sync.status === 'paused' ? 'Cloud saving paused' : sync.status === 'choice' ? 'Choose a save to continue' : 'Sync needs attention'}</span>
      {sync.status === 'ready' && <InfoPopover label="Cloud saving details"><p>Selected data saves automatically while Arkpedia is open.</p><p>Imported game data: {remote.gameSync ? 'saved to your account' : 'browser only'}.</p><button type="button" className="ghost btn-sm" disabled={working} title={SYNC_NOW_HINT} onClick={() => void act(sync.refresh)}>Check for updates</button></InfoPopover>}
      </div>
      {sync.status === 'paused' && <div className={styles.form}>
        <p>{sync.message}</p><div className={styles.actions}><button type="button" className="primary btn-sm" disabled={working} onClick={() => void act(() => sync.choose('browser'))}>Resume cloud saving</button></div>
      </div>}
      {remote && sync.status === 'choice' && <SaveChoice data={remote.data} message={sync.message} working={working} onChoose={source => void act(() => sync.choose(source))} />}
    </>}
    {sync.status === 'error' && <div className={styles.form}><p role="alert">{sync.message}</p><button type="button" className="ghost btn-sm" disabled={working} onClick={() => void act(sync.refresh)}>Retry sync</button></div>}
    {message && !settings && <p role="alert" className="notice notice-danger">{message}</p>}

    </>}
    {welcome && <ImportDialog title={!remote ? 'Log in to Arkpedia' : !remote.profile ? 'Create your account' : sync.status === 'choice' ? 'Choose a save' : 'Account needs attention'} onClose={closeSettings}>
      <div className={styles.form}>
        {remote && !remote.profile && <p className="label-tag">Step 1 of 2 · Profile</p>}
        {sync.status === 'loading' && <p role="status">Checking sign-in…</p>}
        {router.query.signin === 'failed' && <p role="alert" className="notice notice-danger">Sign-in could not finish. Try again with your existing provider.</p>}
    {!remote && sync.status === 'signed-out' && <div className={styles.welcome}>
      <p>Keep your music, plans and preferences across devices.</p>
      <div className={styles.actions}>{(['google', 'discord'] as const).map(provider => sync.providers.includes(provider) &&
        <button type="button" key={provider} disabled={working} onClick={() => void act(() => login(provider))}><ProviderIcon provider={provider} />{working ? 'Connecting…' : `Continue with ${label(provider)}`}</button>)}</div>
      <p className="hint">One login for your settings and plans. No game-account login needed. <Link href="/privacy">Privacy notice</Link>.</p>
    </div>}
    {remote && !remote.profile && <>
      <AccountProfileForm owner={remote.user.id} profile={null} gameSync={remote.gameSync} paused={remote.paused} onSaved={sync.refresh} onboarding onCancel={closeSettings} />
    </>}
      {sync.status === 'paused' && <div className={styles.form}>
        <p>{sync.message}</p><div className={styles.actions}><button type="button" className="primary btn-sm" disabled={working} onClick={() => void act(() => sync.choose('browser'))}>Resume cloud saving</button></div>
      </div>}
      {remote && sync.status === 'choice' && <SaveChoice data={remote.data} message={sync.message} working={working} onChoose={source => void act(() => sync.choose(source))} />}
        {sync.status === 'error' && <><p role="alert">{sync.message}</p><button type="button" className="ghost btn-sm" disabled={working} onClick={() => void act(sync.refresh)}>Retry sync</button></>}
        {message && <p role="alert" className="notice notice-danger">{message}</p>}
        {!remote && <button type="button" className="ghost btn-sm" onClick={closeSettings}>Keep browsing</button>}
      </div>
    </ImportDialog>}
    {settings && remote && !welcome && <ImportDialog title={confirm ? confirmationTitle : onboarding ? 'Choose what to save' : 'Account settings'} onClose={closeSettings} dismissible={!onboarding}>
      {confirm ? <div className={styles.form}>
        <p>{confirm === 'cloud' ? 'Remove your saved music, plans, preferences, pull archive and imported game data from the cloud. Your username, linked logins and browser data stay. Cloud saving pauses on every device until you resume it.'
          : confirm === 'revoke' ? 'Delete the imported game snapshot from your cloud save. Your pull archive and personal-data choices stay unchanged, and your browser import stays here.'
          : confirm === 'history' ? 'Delete all archived pulls from your Arkpedia cloud account and stop saving history. Your browser history stays here. Personal settings and imported game snapshots are separate choices.'
          : confirm === 'personal' ? 'Remove music, plans, story progress and preferences from your cloud save and stop saving them. Browser data, pull archives and imported game-data choices stay unchanged.'
            : 'Permanently remove your Arkpedia profile, linked logins and cloud saves. Your browser data and Arknights account stay. This cannot be undone.'}</p>
        {confirm === 'account' && <><label htmlFor="confirm-account-deletion">Type {remote.profile?.username ?? 'DELETE'} to confirm</label>
          <input type="text" id="confirm-account-deletion" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} />
          <p className="hint">A recent sign-in is required. If needed, confirm with {remote.linkedProviders?.map(label).join(' or ') || 'your provider'}, then return here.</p>
          <div className={styles.actions}>{(['google', 'discord'] as const).filter(p => remote.linkedProviders?.includes(p)).map(provider =>
            <button type="button" className="ghost btn-sm" key={provider} disabled={working} onClick={() => void act(() => login(provider, 'delete'))}><ProviderIcon provider={provider} />Confirm with {label(provider)}</button>)}</div>
        </>}
        <p className="hint">Deleted cloud records may remain in recovery backups until their retention expires.</p>
        <div className={styles.actions}>
          <button type="button" ref={cancel} className="ghost btn-sm" disabled={working} onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className="danger" disabled={working || (confirm === 'account' && typed !== (remote.profile?.username ?? 'DELETE'))} onClick={() => void act(async () => {
            if (confirm === 'cloud') { await sync.erase(); setConfirm(null); }
            else if (confirm === 'revoke' || confirm === 'history' || confirm === 'personal') { await sync.consent(false, confirm === 'history' ? 'historySync' : confirm === 'personal' ? 'personalSync' : 'gameSync'); setConfirm(null); }
            else {
              sync.pause();
              let response;
              try { response = await fetch('/api/account-profile', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner: remote.user.id, confirmation: typed }) }); } finally { await sync.resume(); }
              if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? 'Account deletion could not finish. Try again.'); }
              setSettings(null); setConfirm(null); onSettingsClose?.();
            }
          })}>{working ? 'Working…' : confirm === 'cloud' ? 'Delete cloud saves' : confirm === 'revoke' ? 'Stop saving game data' : confirm === 'history' ? 'Delete cloud pull archive' : confirm === 'personal' ? 'Stop saving personal data' : 'Delete Arkpedia account'}</button>
        </div>
      </div> : <>
        {onboarding ? <p className="label-tag">Step 2 of 2 · Saving</p> : <Tabs label="Account settings" id="account-settings" value={settings} onChange={setSettings} options={[
          { value: 'profile', label: 'Profile' }, ...(pictureContent ? [{ value: 'picture' as const, label: 'Profile picture' }] : []),
          { value: 'audio', label: 'Audio' }, { value: 'saving', label: 'Saving' }, { value: 'logins', label: 'Logins' }, { value: 'data', label: 'Delete data' },
        ]} />}
        {!onboarding && <div {...tabPanelProps('account-settings', 'profile')} hidden={settings !== 'profile'} className={styles.settings}>
          <AccountProfileForm id="edit" owner={remote.user.id} profile={remote.profile} onSaved={async () => { await sync.refresh(); setMessage('Profile saved.'); }} />
        </div>}
        {settings !== 'profile' && <div {...(onboarding ? {} : tabPanelProps('account-settings', settings))} className={styles.settings}>
          {settings === 'audio' && <AudioSettings />}
          {settings === 'picture' && pictureContent}
          {settings === 'saving' && <div className={styles.form}>
            {!onboarding && <h3>What saves to your account</h3>}<p>{onboarding ? 'Choose what Arkpedia can save to its servers. You can leave everything off.' : 'Choose what to keep across devices. You can change this anytime.'}</p>
            {([
              { key: 'personalSync', label: 'Save personal settings and plans', description: 'Music favourites and playlists, plans, story progress and preferences.', enabled: remote.personalSync ?? true, confirmation: 'personal' },
              { key: 'historySync', label: 'Save pull history archive', description: 'Pulls, banner and operator names, game UID and server. Older archived pulls survive later imports and save choices.', enabled: remote.historySync ?? false, confirmation: 'history' },
              { key: 'gameSync', label: 'Save imported game data to my Arkpedia account', description: 'Imported profile, operators and builds, skins, inventory, stage progress and base snapshot. Pull history is controlled separately.', enabled: remote.gameSync, confirmation: 'revoke' },
            ] as const).map(option => <div key={option.key}>
              <label className="check"><input type="checkbox" checked={onboarding ? choices[option.key] : pendingConsent === option.key || option.enabled} disabled={working || (!onboarding && !option.enabled && sync.status !== 'ready' && sync.status !== 'paused')} onChange={event => {
                if (onboarding) { setChoices(previous => ({ ...previous, [option.key]: event.target.checked })); return; }
                if (!event.target.checked) setConfirm(option.confirmation);
                else { setPendingConsent(option.key); void act(async () => { try { await sync.consent(true, option.key); } finally { setPendingConsent(null); } }); }
              }} />{option.label}</label><p className="hint">{option.description}</p>
            </div>)}
            {remote.paused && <p className="hint">Cloud saving is paused. These choices will apply when you resume it.</p>}
            {!onboarding && sync.status !== 'ready' && sync.status !== 'paused' && <p className="hint">Finish setup or resolve your save choice before enabling more saving. You can always stop saving a category.</p>}
            <p className="hint">Your game-login emails, codes and tokens stay in this browser.</p>
            <InfoPopover label="How cloud saving works"><p>Selected data saves while Arkpedia is open. Importing new game data is still done in your browser.</p><p>Stopping a category deletes its active cloud data after confirmation. Remembering a Yostar login is a separate browser-only choice under Import / export.</p></InfoPopover>
            {onboarding && <div className={styles.actions}><button type="button" className="primary btn-sm" disabled={working} onClick={() => void act(async () => { if (await sync.reviewChoices(choices)) onSettingsClose?.(); })}>{working ? 'Saving…' : 'Save choices'}</button></div>}
          </div>}
          {settings === 'logins' && <div className={styles.form}>
            <h3>Linked logins</h3><p>Use either linked provider to reach this account and its saves.</p>
            {(['google', 'discord'] as const).filter(p => sync.providers.includes(p)).map(provider => <div className={styles.provider} key={provider}>
              <span className={styles.providerIdentity}><ProviderIcon provider={provider} /><span><strong>{label(provider)}</strong><span className="hint">{remote.linkedProviders?.includes(provider) ? 'Connected' : 'Not linked'}</span></span></span>
              {remote.linkedProviders?.includes(provider) ? <button type="button" className="ghost btn-sm" disabled={working || remote.linkedProviders.length < 2} onClick={() => void act(async () => {
                const account = remote.linkedAccounts.find(a => a.providerId === provider);
                if (!account) throw new Error('Refresh your account before changing linked logins.');
                const result = await accountClient.unlinkAccount({ accountId: account.id });
                if (result.error) { setReauth(true); throw new Error('This login could not be unlinked. Confirm a recent sign-in and keep another provider connected.'); }
                await sync.refresh();
              })}>Unlink {label(provider)}</button> : <button type="button" className="ghost btn-sm" disabled={working} onClick={() => void act(() => login(provider, 'link'))}>Link {label(provider)}</button>}
            </div>)}
            {reauth && <div className={styles.actions}>{(['google', 'discord'] as const).filter(p => remote.linkedProviders?.includes(p)).map(provider =>
              <button type="button" className="ghost btn-sm" key={provider} disabled={working} onClick={() => void act(() => login(provider, 'confirm'))}><ProviderIcon provider={provider} />Confirm with {label(provider)}</button>)}</div>}
            <p className="hint">Keep at least one login connected. Signing out keeps this browser’s data.</p>
            <div className={styles.actions}><button type="button" className="ghost btn-sm" disabled={working} onClick={() => void act(signOut)}>Sign out</button>
              <button type="button" className="ghost btn-sm" disabled={working} onClick={() => void act(async () => {
                const result = await accountClient.revokeOtherSessions();
                if (result.error) {
                  if (result.error.code === 'SESSION_NOT_FRESH') setReauth(true);
                  throw new Error(result.error.code === 'SESSION_NOT_FRESH' ? 'Confirm with an existing login, then try again.' : 'Other devices could not be signed out. Try again.');
                }
                setReauth(false); setMessage('Other devices signed out.');
              })}>Sign out other devices</button></div>
          </div>}
          {settings === 'data' && <div className={styles.form}>
            <div><h3>Cloud saves</h3><p>Clear your saved data and pause cloud saving. Keep your username and linked logins.</p><button type="button" className="danger" disabled={working} onClick={() => setConfirm('cloud')}>Delete cloud saves</button></div>
            <div><h3>Arkpedia account</h3><p>Delete your profile, linked logins and all cloud saves. This does not affect your game account.</p><button type="button" className="danger" disabled={working} onClick={() => setConfirm('account')}>Delete Arkpedia account</button></div>
            {onOpenData && <div><h3>This browser</h3><p>Import, export or clear data stored on this device.</p><button type="button" className="ghost btn-sm" onClick={() => { closeSettings(); onOpenData(); }}>Browser data & backups</button></div>}
          </div>}
        </div>}
      </>}
      {message && <p role={['Profile saved.', 'Other devices signed out.'].includes(message) ? 'status' : 'alert'} className="notice">{message}</p>}
    </ImportDialog>}
  </Container>;
}
