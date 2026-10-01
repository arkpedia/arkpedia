import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImportError, readAccount, readNetwork, sendCode, signIn, type ImportStep, type Network, type ServerId, type YostarAccount } from '@/lib/account-import/yostar';
import { directTransport, relayTransport } from '@/lib/account-import/relay';
import { forgetLogin, maskEmail, readSavedLogin, saveLogin, type SavedLogin } from '@/lib/account-import/savedLogin';

/*
 * The sign-in with a Yostar email code, and the account it reads (lib/account-import):
 * an email field, a code field and the five steps as they run. Used by /import and by the
 * planner's Export / import dialog. `onAccount` gets the account as the game server sent
 * it. The Yostar login is then kept in this browser (lib/account-import/savedLogin), so the
 * next import is one button; the email and the code are not kept.
 */

const STEPS: { id: ImportStep; label: string }[] = [
  { id: 'network', label: 'Open the encrypted connection' },
  { id: 'sign-in', label: 'Sign in with the code' },
  { id: 'game-token', label: 'Get a game token' },
  { id: 'game-login', label: 'Log in to the game server' },
  { id: 'account', label: 'Read the account' },
];

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function GameSignIn({ server, onAccount, idPrefix = 'import' }: {
  server: ServerId;
  /** The account, once read. A throw is shown as the last step's failure. */
  onAccount: (user: Record<string, any>) => void;
  /** Field ids, distinct per use on one page. */
  idPrefix?: string;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ImportStep | null>(null);
  const [failed, setFailed] = useState<{ step: ImportStep | null; message: string } | null>(null);
  const [done, setDone] = useState(false);
  // The login a past import kept: read after mount (localStorage is not there to render
  // from on the server). Once it is forgotten or has expired, `gone` says so in its place,
  // and its buttons keep their space, so nothing below moves.
  const [saved, setSaved] = useState<SavedLogin | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => { setSaved(readSavedLogin()); }, []);
  // One device id per visit, as one phone signing in.
  const deviceId = useRef<string | null>(null);
  const flow = () => {
    deviceId.current ??= crypto.randomUUID();
    return { transport: relayTransport, server, deviceId: deviceId.current };
  };
  // Opened when the reader first focuses the email field: libcurl.js loads and the game's
  // server list comes back through the relay while they type, and a relay that cannot be
  // reached says so before they have asked Yostar for a code.
  const network = useRef<Promise<Network> | null>(null);
  const [connection, setConnection] = useState<'idle' | 'opening' | 'open' | 'failed'>('idle');
  function connect(): Promise<Network> {
    if (!network.current) {
      setConnection('opening');
      setFailed((current) => (current?.step === 'network' ? null : current));
      network.current = readNetwork(relayTransport, server);
      network.current.then(() => setConnection('open'), (error) => {
        network.current = null;
        setConnection('failed');
        setFailed({ step: 'network', message: describe(error) });
      });
    }
    return network.current;
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
      setFailed({ step: 'send-code', message: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  /** Steps 3 to 5 with a Yostar login, then the account to the caller. */
  async function read(yostar: YostarAccount, device: string) {
    const user = await readAccount({ transport: relayTransport, direct: directTransport, deviceId: device, network: await connect(), onStep: setStep }, yostar);
    onAccount(user);
    setDone(true);
    setStep(null);
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    setStep('sign-in');
    try {
      const yostar = await signIn(flow(), email.trim(), code.trim());
      const login: SavedLogin = { server, ...yostar, deviceId: flow().deviceId, label: maskEmail(email) };
      saveLogin(login);
      setSaved(login);
      setGone(null);
      await read(yostar, login.deviceId);
      // The code is spent, and the login is kept: neither field is needed again.
      setCode('');
      setEmail('');
      setCodeSent(false);
    } catch (error) {
      setFailed({ step: error instanceof ImportError ? error.step : 'account', message: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onImportSaved() {
    if (!saved) return;
    setBusy(true);
    setFailed(null);
    setDone(false);
    setStep('game-token');
    try {
      await read({ uid: saved.uid, token: saved.token }, saved.deviceId);
    } catch (error) {
      const step = error instanceof ImportError ? error.step : 'account';
      // The game no longer takes this login (it expires, or a sign-in elsewhere replaced it).
      if (step === 'game-token') {
        forgetLogin();
        setSaved(null);
        setGone('The saved login has expired.');
        setFailed({ step, message: 'The saved login has expired. Sign in with a new code from your email.' });
      } else {
        setFailed({ step, message: describe(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  function onForget() {
    forgetLogin();
    setSaved(null);
    setGone('The login is forgotten on this browser.');
  }

  const stepIndex = STEPS.findIndex((entry) => entry.id === (failed?.step ?? step));
  const stateOf = (index: number) => {
    if (done) return 'done';
    if (failed && index === stepIndex) return 'failed';
    // The connection is its own step, open before anything else runs.
    if (index === 0) return connection === 'open' ? 'done' : connection === 'opening' ? 'running' : connection === 'failed' ? 'failed' : 'waiting';
    if (stepIndex > index) return 'done';
    return busy && index === stepIndex ? 'running' : 'waiting';
  };

  return (
    <>
      {(saved || gone) && (
        <div className="import-saved">
          <span className="hint">{saved ? `Saved login: ${saved.label}` : gone}</span>
          <div className={`import-saved-actions${saved ? '' : ' import-saved-gone'}`} aria-hidden={!saved}>
            <button type="button" className="primary btn-sm" onClick={onImportSaved} disabled={busy || !saved}>Import again</button>
            <button type="button" className="ghost btn-sm" onClick={onForget} disabled={busy || !saved}>Forget this login</button>
          </div>
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
        {codeSent && <p className="hint import-sent">Yostar has emailed a code to that address. It arrives within a minute or two.</p>}
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
      {failed && <p className="import-error" role="alert">{failed.message}</p>}
    </>
  );
}
