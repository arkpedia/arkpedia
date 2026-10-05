import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImportError, readAccount, readNetwork, readPulls, sendCode, signIn, type ImportStep, type Network, type ServerId, type YostarAccount } from '@/lib/account-import/yostar';
import type { PullRead } from '@/lib/account/pulls';
import { directTransport, relayTransport } from '@/lib/account-import/relay';

/*
 * The sign-in with a Yostar email code, and the account it reads (lib/account-import):
 * an email field, a code field and the steps as they run. Used by the Account page's Import /
 * export dialog. `onAccount` gets the account as the game server sent it, and what the Account
 * Center gave of the pull history: a history it could not read is said in the last step and
 * stops nothing. Nothing of the sign-in is kept: every import asks Yostar for a new code.
 */

/* Where an earlier build kept the Yostar login (a uid and an access token) for one-button
   re-imports. That is gone (the maintainer, 2026-10-02); a login one left behind is
   removed the first time the sign-in is shown. */
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

export default function GameSignIn({ server, onAccount, idPrefix = 'import' }: {
  server: ServerId;
  /** The account and the pull history, once read. A throw is shown as the last step's failure. */
  onAccount: (user: Record<string, any>, pulls: PullRead) => void;
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
  // Why the pull history was not read, when the rest was: its step shows a cross, nothing else does.
  const [pullsFailed, setPullsFailed] = useState<string | null>(null);
  useEffect(() => {
    try { window.localStorage?.removeItem(LEGACY_LOGIN_KEY); } catch { /* Nothing was kept. */ }
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

  /** Steps 3 to 6 with a Yostar login, then the account and the pulls to the caller. */
  async function read(yostar: YostarAccount, device: string) {
    const user = await readAccount({ transport: relayTransport, direct: directTransport, deviceId: device, network: await connect(), onStep: setStep }, yostar);
    setStep('pulls');
    let pulls: PullRead;
    try {
      pulls = { rows: await readPulls(relayTransport, email.trim(), yostar), error: null };
    } catch (error) {
      pulls = { rows: null, error: describe(error) };
    }
    setPullsFailed(pulls.error);
    onAccount(user, pulls);
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
      await read(yostar, flow().deviceId);
      // The code is spent; the email stays for the next import's code.
      setCode('');
      setCodeSent(false);
    } catch (error) {
      setFailed({ step: error instanceof ImportError ? error.step : 'account', message: describe(error) });
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
      {done && pullsFailed && <p className="hint import-note">The pull history could not be read ({pullsFailed}). Everything else was imported.</p>}
    </>
  );
}
