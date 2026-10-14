import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImportError, isNewGameAccount, readAccount, readNetwork, readPulls, sendCode, SERVERS, signIn, type ImportStep, type Network, type ServerId, type YostarAccount } from '@/lib/account-import/yostar';
import type { PullRead } from '@/lib/account/pulls';
import { directTransport, relayTransport } from '@/lib/account-import/relay';
import { forgetLogin, maskEmail, readSavedLogin, saveLogin, type SavedLogin } from '@/lib/account-import/savedLogin';

/*
 * The sign-in with a Yostar email code, and the account it reads (lib/account-import):
 * an email field, a code field and the steps as they run. Used by the Account page's Import /
 * export dialog, for the server it is given. `onAccount` gets the account as the game server sent
 * it, what the Account Center gave of the pull history (a history it could not read is said in the
 * last step and stops nothing), and the server both came from: a remembered sign-in is its own
 * server's, whichever the dialog shows. Nothing of the sign-in is kept unless the reader ticks "Remember this sign-in on
 * this browser" (lib/account-import/savedLogin.ts): then the next import is one button, until they
 * forget it or the game stops accepting it.
 */

/* Where a build before 2026-10-02 kept the Yostar login without asking. A login one left behind
   is removed the first time the sign-in is shown; a remembered sign-in now lives under its own
   key, and only when the reader asks (savedLogin.ts). */
export const LEGACY_LOGIN_KEY = 'arkpediaGameLogin';

const STEPS: { id: ImportStep; label: string }[] = [
  { id: 'network', label: 'Open the encrypted connection' },
  { id: 'sign-in', label: 'Sign in with the code' },
  { id: 'game-token', label: 'Get a game token' },
  { id: 'game-login', label: 'Log in to the game server' },
  { id: 'account', label: 'Read the account' },
  { id: 'pulls', label: 'Read the pull history' },
];

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/* Where in the game the login is shown and an email is linked to the account: the Settings
   menu's Account tab (arknights.wiki.gg's 2025 screenshots of the Global client and its list:
   "Yostar: Binding to/unbinding from a Yostar account"). The binding there emails a code
   (Krooster's import page, which also warns that a recovery email or a Google, Apple or Facebook
   binding is not a Yostar login). No menu name past the tab is written here. */
const ACCOUNT_SETTINGS = 'Settings → Account';

/** What a failure says, and whether it is the case of a Yostar account with no Arknights
 *  account (ImportError noGameAccount), which is told with the way back (NoGameAccount). */
type Failure = { step: ImportStep | null; message: string; noGameAccount?: boolean };
const failure = (error: unknown, fallback: ImportStep = 'account'): Failure => (error instanceof ImportError
  ? { step: error.step, message: describe(error), noGameAccount: error.noGameAccount }
  : { step: fallback, message: describe(error) });

/** The account the game gave was new and empty (isNewGameAccount). */
export const NEW_ACCOUNT = 'the game opened a new, empty level-1 account for this login';

/**
 * The Yostar login has no Arknights account: Yostar made it for this email just now, as it does
 * for any email that is not already a game account's Yostar login. So a player whose game is
 * linked to Google or Apple, who typed that Gmail, has a second Yostar account, and must undo it
 * in the game before this email is any use for theirs (the steps are the site owner's).
 * Nothing was imported.
 */
export function NoGameAccount({ reason }: { reason: string }) {
  // A new, empty account is sure; a refusal from the game is most likely the same, not certain.
  const sure = reason === NEW_ACCOUNT;
  return (
    <div className="import-error import-no-account" role="alert">
      <p>
        This Yostar account {sure ? 'has' : 'may have'} no Arknights account, so nothing was imported. It may have just been
        created by this login: Yostar makes a new account for any email that is not already the Yostar login of a game account, as
        when you play with Google or Apple.
      </p>
      {!sure && (
        <p>
          If this email is the login you already use in the game, the game was most likely unavailable: try again later. Only if
          it is not, and you play with Google or Apple, do this:
        </p>
      )}
      <p>To use this email with your game account:</p>
      <ol>
        <li>Sign in to Arknights with this email. This makes a game account on it.</li>
        <li>Play until the game lets you delete that account, then delete it.</li>
        <li>Sign back in to the game with Google or Apple, your real account.</li>
        <li>Link this email to it as its Yostar login ({ACCOUNT_SETTINGS}), then import here with it.</li>
      </ol>
      <p>Or link a different email, one never used with Yostar, to your game account, and import with that.</p>
      <p className="hint">What the game said: {reason}.</p>
    </div>
  );
}

export default function GameSignIn({ server, onAccount, idPrefix = 'import' }: {
  server: ServerId;
  /** The account, the pull history and their server, once read. A throw is shown as the last
   *  step's failure. */
  onAccount: (user: Record<string, any>, pulls: PullRead, server: ServerId) => void;
  /** Field ids, distinct per use on one page. */
  idPrefix?: string;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ImportStep | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);
  // Why the pull history was not read, when the rest was: its step shows a cross, nothing else does.
  const [pullsFailed, setPullsFailed] = useState<string | null>(null);
  // The remembered sign-in, if the reader asked for one; read after mount, as storage is.
  const [saved, setSaved] = useState<SavedLogin | null>(null);
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    try { window.localStorage?.removeItem(LEGACY_LOGIN_KEY); } catch { /* Nothing was kept. */ }
    setSaved(readSavedLogin());
  }, []);
  // One device id per visit, as one phone signing in.
  const deviceId = useRef<string | null>(null);
  const flow = () => {
    deviceId.current ??= crypto.randomUUID();
    return { transport: relayTransport, server, deviceId: deviceId.current };
  };
  // Opened when the reader first focuses the email field: libcurl.js loads and the game's
  // server list comes back through the relay while they type, and a relay that cannot be
  // reached says so before they have asked Yostar for a code.
  // One per server: a remembered sign-in may be another server's than the one shown.
  const networks = useRef<Partial<Record<ServerId, Promise<Network>>>>({});
  const [connection, setConnection] = useState<'idle' | 'opening' | 'open' | 'failed'>('idle');
  function connect(from: ServerId = server): Promise<Network> {
    let network = networks.current[from];
    if (!network) {
      setConnection('opening');
      setFailed((current) => (current?.step === 'network' ? null : current));
      network = readNetwork(relayTransport, from);
      networks.current[from] = network;
      network.then(() => setConnection('open'), (error) => {
        delete networks.current[from];
        setConnection('failed');
        setFailed({ step: 'network', message: describe(error) });
      });
    }
    return network;
  }

  async function onSendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    setDone(false);
    try {
      await sendCode(flow(), email.trim());
      setCodeSent(true);
    } catch (error) {
      setFailed(failure(error, 'send-code'));
    } finally {
      setBusy(false);
    }
  }

  /** Steps 3 to 6 with a Yostar login on `from`, then the account and the pulls to the caller. */
  async function read(yostar: YostarAccount, device: string, signedInAs: string, from: ServerId) {
    const user = await readAccount({ transport: relayTransport, direct: directTransport, deviceId: device, network: await connect(from), onStep: setStep }, yostar);
    // Not the reader's account: imported, it would take the place of theirs.
    if (isNewGameAccount(user)) throw new ImportError('account', NEW_ACCOUNT, true);
    setStep('pulls');
    let pulls: PullRead;
    try {
      pulls = { rows: await readPulls(relayTransport, from, signedInAs, yostar), error: null };
    } catch (error) {
      pulls = { rows: null, error: describe(error) };
    }
    setPullsFailed(pulls.error);
    onAccount(user, pulls, from);
    setDone(true);
    setStep(null);
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    setPullsFailed(null);
    setStep('sign-in');
    try {
      const yostar = await signIn(flow(), email.trim(), code.trim());
      await read(yostar, flow().deviceId, email.trim(), server);
      // Kept only when the reader asked, and only once the sign-in has worked.
      if (remember) {
        const login: SavedLogin = { server, email: email.trim(), ...yostar, deviceId: flow().deviceId };
        saveLogin(login);
        setSaved(login);
      }
      // The code is spent; the email stays for the next import's code.
      setCode('');
      setCodeSent(false);
    } catch (error) {
      setFailed(failure(error));
    } finally {
      setBusy(false);
    }
  }

  /** The remembered sign-in, straight to the game: no code, the device id it was issued to. */
  async function onImportAgain() {
    if (!saved) return;
    setBusy(true);
    setFailed(null);
    setPullsFailed(null);
    setDone(false);
    setStep('game-token');
    deviceId.current = saved.deviceId;
    try {
      await read(saved, saved.deviceId, saved.email, saved.server);
    } catch (error) {
      const at = error instanceof ImportError ? error.step : 'account';
      // The game refused it: expired or revoked, so it is forgotten rather than tried again.
      if (at === 'game-token' || at === 'game-login') {
        forgetLogin();
        setSaved(null);
        setFailed({ step: at, message: 'Your remembered sign-in no longer works, so it was forgotten. Sign in with a code again.' });
      } else {
        // It had an account when it was remembered.
        setFailed({ ...failure(error), noGameAccount: false });
      }
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((entry) => entry.id === (failed?.step ?? step));
  const stateOf = (index: number) => {
    if (done) return STEPS[index].id === 'pulls' && pullsFailed ? 'failed' : 'done';
    if (failed && index === stepIndex) return 'failed';
    // The connection is its own step, open before anything else runs.
    if (index === 0) return connection === 'open' ? 'done' : connection === 'opening' ? 'running' : connection === 'failed' ? 'failed' : 'waiting';
    if (stepIndex > index) return 'done';
    return busy && index === stepIndex ? 'running' : 'waiting';
  };

  return (
    <>
      <div className="import-yostar">
        <p>
          <b>Use the email that is already the Yostar login of your Arknights account.</b> Any other email, such as the Gmail
          you play with through Google, makes Yostar create a separate, empty account for it, and nothing is imported. Undoing
          that takes several steps in the game.
        </p>
        <p>
          So check in the game which login you use first ({ACCOUNT_SETTINGS}). If you play with Google, Apple or Facebook only,
          link an email there as its Yostar login (the option that emails you a code), then use that email here.
        </p>
      </div>
      {saved && (
        <div className="import-saved">
          <span className="hint">Remembered on this browser: <b>{maskEmail(saved.email)}</b> ({SERVERS[saved.server].label})</span>
          <button type="button" className="primary btn-sm" onClick={onImportAgain} disabled={busy}>Import again</button>
          <button type="button" className="ghost btn-sm" onClick={() => { forgetLogin(); setSaved(null); }} disabled={busy}>Forget sign-in</button>
        </div>
      )}
      <div className="import-forms">
        <form className="import-row" onSubmit={onSendCode}>
          <label className="visually-hidden" htmlFor={`${idPrefix}-email`}>Yostar email</label>
          <input
            id={`${idPrefix}-email`}
            type="text"
            inputMode="email"
            autoComplete="email"
            placeholder="Yostar email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => { connect().catch(() => {}); }}
            disabled={busy}
            required
          />
          <button type="submit" className="primary btn-sm" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>
            {codeSent ? 'Send again' : 'Send code'}
          </button>
        </form>
        {codeSent && <p className="hint import-sent">Yostar has emailed a code to that address. It arrives within a minute or two; if none comes, check your spam folder, and that this is the Yostar login of your game account.</p>}
        <form className="import-row" onSubmit={onImport}>
          <label className="visually-hidden" htmlFor={`${idPrefix}-code`}>Code from the email</label>
          <input
            id={`${idPrefix}-code`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code from the email"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy || !codeSent}
            required
          />
          <button type="submit" className="primary btn-sm" disabled={busy || !codeSent || !code.trim()}>Import</button>
        </form>
        <label className="check import-remember" title="Kept in this browser only. Anyone using this browser could import with it, so leave it off on a shared computer.">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} />
          Remember this sign-in on this browser
        </label>
      </div>

      <ol className="import-steps" aria-live="polite">
        {STEPS.map((entry, index) => {
          const state = stateOf(index);
          return (
            <li key={entry.id} className={`import-step import-step-${state}`}>
              <span className="import-step-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'running' ? '…' : '·'}</span>
              {entry.label}
            </li>
          );
        })}
      </ol>
      {failed && (failed.noGameAccount ? <NoGameAccount reason={failed.message} /> : <p className="import-error" role="alert">{failed.message}</p>)}
      {done && pullsFailed && <p className="hint import-note">The pull history could not be read ({pullsFailed}). Everything else was imported.</p>}
    </>
  );
}
