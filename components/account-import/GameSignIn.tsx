import { useRef, useState, type FormEvent } from 'react';
import { ImportError, readAccount, readNetwork, sendCode, signIn, type ImportStep, type Network, type ServerId } from '@/lib/account-import/yostar';
import { directTransport, relayTransport } from '@/lib/account-import/relay';

/*
 * The sign-in with a Yostar email code, and the account it reads (lib/account-import):
 * an email field, a code field and the five steps as they run. Used by /import and by the
 * planner's Import / Export dialog. `onAccount` gets the account as the game server sent
 * it; the email, the code and every token stay inside this component, for one import.
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

  async function onImport(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    setStep('sign-in');
    try {
      const yostar = await signIn(flow(), email.trim(), code.trim());
      const user = await readAccount({ transport: relayTransport, direct: directTransport, deviceId: flow().deviceId, network: await connect(), onStep: setStep }, yostar);
      onAccount(user);
      setDone(true);
      setStep(null);
      // Neither is needed again: a new import needs a new code.
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
    if (done) return 'done';
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
    </>
  );
}
