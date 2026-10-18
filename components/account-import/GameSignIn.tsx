import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImportError, readAccount, readNetwork, readPulls, sendCode, SERVERS, signIn, type ImportStep, type Network, type ServerId, type YostarAccount } from '@/lib/account-import/yostar';
import { isResettingBrowserData } from '@/lib/account/resetData';
import type { PullRead } from '@/lib/account/pulls';
import { directTransport, networkTransport, relayTransport } from '@/lib/account-import/relay';
import { forgetLogin, maskEmail, readSavedLogin, saveLogin, type SavedLogin } from '@/lib/account-import/savedLogin';
import { useCodeCooldown } from '@/lib/account-import/codeCooldown';

/*
 * The sign-in with a Yostar email code, and the account it reads (lib/account-import):
 * an email field, a code field and the steps as they run. Used by the Account page's Import /
 * export dialog, for the server it is given. `onAccount` gets the account as the game server sent
 * it, what the Account Center gave of the pull history (a history it could not read is said in the
 * last step and stops nothing), and the server both came from. A successful sign-in is remembered
 * locally unless the reader chooses not to save it (lib/account-import/savedLogin.ts). Its own
 * server shows Import and Request code until the game stops accepting it; other
 * servers show their own email login.
 */

/* Where a build before 2026-10-02 kept the Yostar login without asking. A login one left behind
   is removed the first time the sign-in is shown; the current saved sign-in has its own key. */
export const LEGACY_LOGIN_KEY = 'arkpediaGameLogin';

const STEPS: { id: ImportStep; label: string }[] = [
  { id: 'network', label: 'Read the game server settings' },
  { id: 'sign-in', label: 'Sign in with the code' },
  { id: 'game-token', label: 'Get a game token' },
  { id: 'game-login', label: 'Log in to the game server' },
  { id: 'account', label: 'Read the account' },
  { id: 'pulls', label: 'Read the pull history' },
];

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

const ACCOUNT_SETTINGS = 'Settings → Account';

export default function GameSignIn({ server, onAccount, onForget, idPrefix = 'import' }: {
  server: ServerId;
  /** The account, the pull history and their server, once read. A throw is shown as the last
   *  step's failure. */
  onAccount: (user: Record<string, any>, pulls: PullRead, server: ServerId) => void;
  /** Field ids, distinct per use on one page. */
  idPrefix?: string;
  /** Clears all saved site data after the dialog confirms the scope. */
  onForget: () => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [retryingCode, setRetryingCode] = useState(false);
  const { secondsLeft, begin: beginCodeRequest, finish: finishCodeRequest } = useCodeCooldown(server);
  const [busy, setBusy] = useState(false);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const [step, setStep] = useState<ImportStep | null>(null);
  const [failed, setFailed] = useState<{ step: ImportStep | null; message: string } | null>(null);
  const [done, setDone] = useState(false);
  // Why the pull history was not read, when the rest was: its step shows a cross, nothing else does.
  const [pullsFailed, setPullsFailed] = useState<string | null>(null);
  // DataDialog opens after hydration, so its first render can select the saved path without
  // briefly showing the email form. A token is usable only on the server it was issued for.
  const [saved, setSaved] = useState<SavedLogin | null>(readSavedLogin);
  const savedForServer = saved?.server === server ? saved : null;
  const [dontSave, setDontSave] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const savedImport = useRef<HTMLButtonElement>(null);
  const codeRequest = useRef<HTMLButtonElement>(null);
  const hasSaved = Boolean(savedForServer);
  const previousSaved = useRef(hasSaved);
  useEffect(() => {
    try { window.localStorage?.removeItem(LEGACY_LOGIN_KEY); } catch { /* Nothing was kept. */ }
  }, []);
  useEffect(() => {
    if (busy) return;
    if (previousSaved.current !== hasSaved) {
      previousSaved.current = hasSaved;
      (hasSaved ? savedImport.current : emailInput.current)?.focus();
    } else if (step === 'send-code') {
      (hasSaved ? savedImport.current : codeInput.current)?.focus();
    }
  }, [hasSaved, busy, step]);
  // One device id per visit, as one phone signing in.
  const deviceId = useRef<string | null>(null);
  const flow = () => {
    deviceId.current ??= crypto.randomUUID();
    return { transport: relayTransport, server, deviceId: deviceId.current };
  };
  // Public settings load while the reader types. The website shares these small reads;
  // credentials and account data still go through the browser's encrypted tunnel.
  // One per server: a remembered sign-in may be another server's than the one shown.
  const networks = useRef<Partial<Record<ServerId, Promise<Network>>>>({});
  const [connection, setConnection] = useState<'idle' | 'opening' | 'open' | 'failed'>('idle');
  function connect(from: ServerId = server): Promise<Network> {
    let network = networks.current[from];
    if (!network) {
      setConnection('opening');
      setFailed((current) => (current?.step === 'network' ? null : current));
      network = readNetwork(networkTransport, from);
      networks.current[from] = network;
      network.then(() => setConnection('open'), () => {
        delete networks.current[from];
        setConnection('failed');
        // Background metadata readiness must not turn a successful email into an error.
        // Import and Retry connection report this rejection at their own action boundary.
      });
    }
    return network;
  }

  async function requestCode(address: string) {
    if (busy || !beginCodeRequest()) return;
    setBusy(true);
    setFailed(null);
    setDone(false);
    setCodeSent(false);
    setRetryingCode(false);
    setStep('send-code');
    try {
      // Emailing a code needs only Yostar, including when no sign-in is saved.
      if (savedForServer) deviceId.current = savedForServer.deviceId;
      await sendCode(flow(), address, () => setRetryingCode(true));
      setCodeSent(true);
    } catch (error) {
      setFailed({ step: error instanceof ImportError ? error.step : 'send-code', message: describe(error) });
    } finally {
      finishCodeRequest();
      setRetryingCode(false);
      setBusy(false);
    }
  }

  async function onSendCode(event: FormEvent) {
    event.preventDefault();
    if (validEmail) await requestCode(email.trim());
  }

  /** Steps 3 to 6 with a Yostar login on `from`, then the account and the pulls to the caller. */
  async function read(yostar: YostarAccount, device: string, signedInAs: string, from: ServerId) {
    const user = await readAccount({ transport: relayTransport, direct: directTransport, deviceId: device, network: await connect(from), onStep: setStep }, yostar);
    setStep('pulls');
    let pulls: PullRead;
    try {
      pulls = { rows: await readPulls(relayTransport, from, signedInAs, yostar), error: null };
    } catch (error) {
      pulls = { rows: null, error: describe(error) };
    }
    setPullsFailed(pulls.error);
    if (isResettingBrowserData()) return;
    onAccount(user, pulls, from);
    setDone(true);
    setStep(null);
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    if (busy || !validEmail || !code.trim()) return;
    setBusy(true);
    setFailed(null);
    setPullsFailed(null);
    setDone(false);
    setStep('sign-in');
    try {
      await connect();
      const yostar = await signIn(flow(), email.trim(), code.trim());
      await read(yostar, flow().deviceId, email.trim(), server);
      if (isResettingBrowserData()) return;
      // Save only after the import works. Opting out clears any older saved login too.
      if (!dontSave) {
        const login: SavedLogin = { server, email: email.trim(), ...yostar, deviceId: flow().deviceId };
        saveLogin(login);
        setSaved(readSavedLogin());
      } else {
        forgetLogin();
        setSaved(null);
      }
      // The code is spent; the email stays for the next import's code.
      setCode('');
      setCodeSent(false);
    } catch (error) {
      setFailed({ step: error instanceof ImportError ? error.step : 'account', message: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  /** The remembered sign-in, straight to the game: no code, the device id it was issued to. */
  async function onSavedImport() {
    if (busy || !savedForServer) return;
    setBusy(true);
    setFailed(null);
    setPullsFailed(null);
    setDone(false);
    setStep('game-token');
    deviceId.current = savedForServer.deviceId;
    try {
      await read(savedForServer, savedForServer.deviceId, savedForServer.email, savedForServer.server);
    } catch (error) {
      const at = error instanceof ImportError ? error.step : 'account';
      // The game refused it: expired or revoked, so it is forgotten rather than tried again.
      if (at === 'game-token' || at === 'game-login') {
        forgetLogin();
        setSaved(null);
        setEmail(savedForServer.email);
        setCode('');
        setCodeSent(false);
        setStep(null);
        setFailed({ step: null, message: 'Your saved sign-in no longer works. Sign in with a code again.' });
      } else {
        setFailed({ step: at, message: describe(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  const steps = savedForServer ? STEPS.filter(entry => entry.id !== 'sign-in') : STEPS;
  const stepIndex = steps.findIndex((entry) => entry.id === (failed?.step ?? step));
  const stateOf = (index: number) => {
    if (done) return steps[index].id === 'pulls' && pullsFailed ? 'failed' : 'done';
    if (failed && index === stepIndex) return 'failed';
    // Server settings are their own step, read before anything else runs.
    if (index === 0) return connection === 'open' ? 'done' : connection === 'opening' ? 'running' : 'waiting';
    if (stepIndex > index) return 'done';
    return busy && index === stepIndex ? 'running' : 'waiting';
  };

  const forgetButton = <button type="button" className="ghost btn-sm" onClick={onForget} disabled={busy}>Forget everything</button>;
  return (
    <>
      {savedForServer ? (
        <div className="import-saved">
          <span className="hint import-saved-identity">Saved on this browser: <b>{maskEmail(savedForServer.email)}</b> ({SERVERS[savedForServer.server].label})</span>
          <button ref={savedImport} type="button" className="primary btn-sm" onClick={onSavedImport} disabled={busy}>Import</button>
          <button ref={codeRequest} type="button" className="ghost btn-sm" onClick={() => requestCode(savedForServer.email)} disabled={busy || secondsLeft > 0}>Request code</button>
          {forgetButton}
          {codeSent && <p className="hint import-sent" role="status">Yostar has emailed a code to your saved address.</p>}
        </div>
      ) : (
        <>
          <div className="import-yostar">
            <p>
              <b>Use the email that is already the Yostar login of your Arknights account.</b> Any other email, such as the Gmail
              you play with through Google, makes Yostar create a separate, empty account for it. Undoing
              that takes several steps in the game.
            </p>
            <p>
              So check in the game which login you use first ({ACCOUNT_SETTINGS}). If you play with Google, Apple or Facebook only,
              link an email there as its Yostar login (the option that emails you a code), then use that email here.
            </p>
          </div>
          <div className="import-forms">
            <form className="import-row" onSubmit={onSendCode}>
              <label className="visually-hidden" htmlFor={`${idPrefix}-email`}>Yostar email</label>
              <input
                ref={emailInput}
                id={`${idPrefix}-email`}
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="Yostar email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setCodeSent(false); }}
                onFocus={() => { connect().catch(() => {}); }}
                disabled={busy}
                required
              />
              <button ref={codeRequest} type="submit" className="primary btn-sm" disabled={busy || !validEmail || secondsLeft > 0}>
                {codeSent ? 'Send again' : 'Send code'}
              </button>
            </form>
            {codeSent && <p className="hint import-sent">Yostar has emailed a code to that address. It arrives within a minute or two.</p>}
            <form className="import-row" onSubmit={onImport}>
              <label className="visually-hidden" htmlFor={`${idPrefix}-code`}>Code from the email</label>
              <input
                ref={codeInput}
                id={`${idPrefix}-code`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code from the email"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={busy}
                required
              />
              <button type="submit" className="primary btn-sm" disabled={busy || !validEmail || !code.trim()}>Import</button>
            </form>
            <label className="check import-remember" title="Sign-in is saved locally after a successful import. Check this on a shared browser to require a code next time.">
              <input type="checkbox" checked={dontSave} onChange={(event) => setDontSave(event.target.checked)} disabled={busy} />
              Don’t save this sign-in on this browser
            </label>
          </div>
          <div className="data-dialog-acts">{forgetButton}</div>
        </>
      )}

      {retryingCode && <p className="hint import-note" role="status">Connection failed. Retrying once…</p>}
      {!busy && secondsLeft > 0 && <p className="hint import-note" aria-live="off">Request another code in {secondsLeft}s.</p>}

      {(!savedForServer || (step !== 'send-code' && (busy || done || failed))) && (
        <ol className="import-steps" aria-live="polite">
          {steps.map((entry, index) => {
            const state = stateOf(index);
            return (
              <li key={entry.id} className={`import-step import-step-${state}`}>
                <span className="import-step-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'running' ? '…' : '·'}</span>
                {entry.label}
              </li>
            );
          })}
        </ol>
      )}
      {failed && <p className="import-error" role="alert">{failed.message}</p>}
      {failed?.step === 'network' && <button type="button" className="ghost btn-sm" disabled={busy || connection === 'opening'} onClick={() => { connect().catch(error => setFailed({ step: 'network', message: describe(error) })); }}>Retry connection</button>}
      {done && pullsFailed && <p className="hint import-note">The pull history could not be read ({pullsFailed}). Everything else was imported.</p>}
    </>
  );
}
