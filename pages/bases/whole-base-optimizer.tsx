import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { WholeBaseResult } from '@/lib/base/wholeBaseOptimizer';

interface WholeBaseResults {
  generatedAt: string;
  balanced: WholeBaseResult;
  total: WholeBaseResult;
}

const UNIT_DECIMALS: Record<string, number> = {
  'LMD/day': 0,
  'Precious Metals/day': 1,
  'EXP/day': 0,
};

function RoomTable({ result }: { result: WholeBaseResult }) {
  return (
    <table className="optimizer-options-table whole-base-room-table">
      <thead>
        <tr>
          <th>Room</th>
          <th>Operators</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {result.rooms.map((room) => (
          <tr key={room.label}>
            <td>{room.label}</td>
            <td className="optimizer-options-filler">{room.operators.length > 0 ? room.operators.join(', ') : '(empty)'}</td>
            <td>
              {room.value.toFixed(UNIT_DECIMALS[room.unit] ?? 1)} {room.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StrategyPanel({ title, description, result }: { title: string; description: string; result: WholeBaseResult }) {
  return (
    <div className="optimizer-group whole-base-strategy">
      <div className="optimizer-group-header">
        <span className="optimizer-core">{title}</span>
      </div>
      <p className="sub">{description}</p>
      <RoomTable result={result} />
      <p className="sub whole-base-totals">
        Totals: {result.totals.lmd.toFixed(0)} LMD/day · {result.totals.gold.toFixed(1)} Precious Metals/day · {result.totals.exp.toFixed(0)} EXP/day
      </p>
      <p className="sub">
        Unconditionally placed support: {result.supportPlacements.map((s) => `${s.name} (${s.room})`).join(', ')}
      </p>
      <p className="sub">Gummy placed in a Trading Post: {result.gummyPlaced ? 'yes' : 'no'}</p>
    </div>
  );
}

export default function WholeBaseOptimizerPage() {
  const [results, setResults] = useState<WholeBaseResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [passcode, setPasscode] = useState('');

  useEffect(() => {
    setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    loadCachedResults();
  }, []);

  async function loadCachedResults() {
    setLoading(true);
    try {
      const res = await fetch('/api/whole-base-optimizer-results');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runOptimizer() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/run-whole-base-optimizer', { method: 'POST', headers: { 'x-dev-passcode': passcode } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Head><title>Whole-Base Optimizer — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Base Optimizer</div>
        <h1>Whole-Base Optimizer</h1>
        <p className="sub">
          Best full layout across both Trading Posts and all four Factories at once, sharing a single operator pool
          so nobody is ever double-booked. Support operators needed to unlock cross-room bonuses (Gnosis, Kirin R
          Yato, Rathalos S Noir Corne, Mulberry, Senshi) are placed unconditionally in Control Center/Office/Dormitory
          and removed from the production pool. Gummy is evaluated both ways -- included in a Trading Post (to unlock
          Leto&apos;s Factory bonus) and left out entirely -- and whichever produces more total value is kept.
        </p>
        <div className="stages-category-row" style={{ marginTop: 10 }}>
          <Link prefetch={false} href="/base" className="ghost">
            ← Back to Base
          </Link>
          <Link prefetch={false} href="/base/optimizer" className="ghost">
            Per-Room Optimizer
          </Link>
          {isLocal && (
            <>
              <input
                type="password"
                placeholder="Dev passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                style={{ marginLeft: 'auto' }}
              />
              <button type="button" className="primary" onClick={runOptimizer} disabled={running}>
                {running ? 'Running...' : 'Run Optimizer'}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="main-wide">
        {loading && <p>Loading cached results...</p>}
        {error && !results && <p className="sub">{error}</p>}
        {results && (
          <>
            <p className="sub">Last computed: {new Date(results.generatedAt).toLocaleString()}</p>
            <section>
              <h2>Balanced Strategy</h2>
              <StrategyPanel
                title="Balanced across LMD, Precious Metals, and EXP"
                description="Fills whichever of the three resource types is furthest behind its own best-single-room pace at each step, so no single resource dominates the layout."
                result={results.balanced}
              />
            </section>
            <section>
              <h2>Total-Value Strategy</h2>
              <StrategyPanel
                title="Maximize combined value (LMD + Precious Metals × 400 + EXP)"
                description="Fills Trading Post, then Precious-Metal Factory, then Battle-Record Factory, repeating in that order, always taking the best available combo for the room being filled."
                result={results.total}
              />
            </section>
          </>
        )}
      </main>
    </>
  );
}