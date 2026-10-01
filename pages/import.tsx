import { useRef, useState, type FormEvent } from 'react';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import { ImportError, SERVERS, readAccount, readNetwork, sendCode, signIn, type ImportStep, type Network } from '@/lib/account-import/yostar';
import { directTransport, relayTransport } from '@/lib/account-import/relay';

/*
 * Account import, first cut (issue #94): sign in with the Yostar email code and read the
 * account, entirely from this page (lib/account-import). Unlisted while it is tried on
 * the dev site; what the account feeds (the planner's roster) comes next.
 */

const STEPS: { id: ImportStep; label: string }[] = [
  { id: 'network', label: 'Open the encrypted connection' },
  { id: 'sign-in', label: 'Sign in with the code' },
  { id: 'game-token', label: 'Get a game token' },
  { id: 'game-login', label: 'Log in to the game server' },
  { id: 'account', label: 'Read the account' },
];

interface Summary {
  name: string;
  level: number | null;
  operators: number;
  elite2: number;
  items: number;
}

function summarize(user: Record<string, any>): Summary {
  const status = user.status ?? {};
  const chars = Object.values(user.troop?.chars ?? {}) as { evolvePhase?: number }[];
  return {
    name: status.nickName ? `${status.nickName}#${status.nickNumber ?? ''}` : 'Doctor',
    level: typeof status.level === 'number' ? status.level : null,
    operators: chars.length,
    elite2: chars.filter((char) => char.evolvePhase === 2).length,
    items: Object.values(user.inventory ?? {}).filter((count) => typeof count === 'number' && count > 0).length,
  };
}

const describe = (error: unknown) => (error instanceof ImportError || error instanceof Error ? error.message : String(error));

export default function ImportPage() {
  const server = 'en' as const;
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ImportStep | null>(null);
  const [failed, setFailed] = useState<{ step: ImportStep | null; message: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  // The account itself, for the download only. Never stored anywhere else.
  const account = useRef<Record<string, any> | null>(null);
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
      account.current = user;
      setSummary(summarize(user));
      setStep(null);
      // Neither is needed again: a new import needs a new code.
      setCode('');
      setEmail('');
    } catch (error) {
      setFailed({ step: error instanceof ImportError ? error.step : null, message: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!account.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(account.current, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `arknights-account-${summary?.name.replace(/[^\w-]+/g, '_') ?? 'doctor'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const stepIndex = STEPS.findIndex((entry) => entry.id === (failed?.step ?? step));
  const stateOf = (index: number) => {
    if (summary) return 'done';
    if (failed && index === stepIndex) return 'failed';
    // The connection is its own step, open before anything else runs.
    if (index === 0) return connection === 'open' ? 'done' : connection === 'opening' ? 'running' : connection === 'failed' ? 'failed' : 'waiting';
    if (stepIndex > index) return 'done';
    return busy && index === stepIndex ? 'running' : 'waiting';
  };

  return (
    <>
      <Head>
        <title>Account import — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>

      <PageHeader
        eyebrow="Rhodes Island // Account import"
        title="Account import"
        sub="Read your Arknights account into Arkpedia: operators, levels and inventory."
      />

      <main>
        <section className="op-section">
          <h2>How it works</h2>
          <p className="import-copy">
            You sign in with your Yostar email, as the game does. Your email, the code and the game&apos;s tokens go
            from this page to Yostar and the game&apos;s servers, encrypted end to end. The requests a browser cannot
            send by itself pass through <code>relay.arkpedia.net</code> as encrypted traffic it cannot read. Nothing
            is stored, not in this browser and not on our servers.
          </p>
          <p className="hint import-note">
            This is a sign-in like the game&apos;s own: if the game is open on your phone, it goes back to the
            title screen, and starting it again signs you straight back in, with no new code.
            Server: {SERVERS[server].label}. Test version: the account is read and summarized, not used anywhere yet.
          </p>

          <div className="import-forms">
          <form className="import-row" onSubmit={onSendCode}>
            <label className="visually-hidden" htmlFor="import-email">Yostar email</label>
            <input
              id="import-email"
              type="text"
              inputMode="email"
              autoComplete="email"
              placeholder="Yostar email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={() => { connect().catch(() => {}); }}
              disabled={busy || summary !== null}
              required
            />
            <button type="submit" className="primary btn-sm" disabled={busy || summary !== null || !/^\S+@\S+\.\S+$/.test(email.trim())}>
              {codeSent ? 'Send again' : 'Send code'}
            </button>
          </form>
          {codeSent && !summary && <p className="hint import-sent">Yostar has emailed a code to that address. It arrives within a minute or two.</p>}

          <form className="import-row" onSubmit={onImport}>
            <label className="visually-hidden" htmlFor="import-code">Code from the email</label>
            <input
              id="import-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the email"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy || !codeSent || summary !== null}
              required
            />
            <button type="submit" className="primary btn-sm" disabled={busy || !codeSent || summary !== null || !code.trim()}>
              Import
            </button>
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
        </section>

        {summary && (
          <section className="op-section">
            <h2>Your account</h2>
            <dl className="import-summary">
              <div><dt>Doctor</dt><dd>{summary.name}</dd></div>
              <div><dt>Level</dt><dd>{summary.level ?? '—'}</dd></div>
              <div><dt>Operators</dt><dd>{summary.operators}</dd></div>
              <div><dt>Elite 2</dt><dd>{summary.elite2}</dd></div>
              <div><dt>Item kinds</dt><dd>{summary.items}</dd></div>
            </dl>
            <button type="button" className="btn-sm" onClick={download}>Download the account as JSON</button>
            <p className="hint">The download is made in this browser from what the game sent. Reload the page to forget it.</p>
          </section>
        )}
      </main>
    </>
  );
}
