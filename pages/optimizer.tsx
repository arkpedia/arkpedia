import { useEffect, useState, ReactNode } from 'react';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import { devOnlyStaticProps } from '@/lib/dev/devOnly';

export const getStaticProps = devOnlyStaticProps;

interface TpResult {
  combo: string[];
  effectiveProductivity: number | null;
  effectiveLimit: number | null;
  dailyGold: number;
  dailyLmd: number;
}
interface FactoryResult {
  combo: string[];
  effectiveProductivity: number;
  dailyOutput: number;
}
interface TpOption {
  fillers: string[];
  score: number;
  example: TpResult;
}
interface TpGroup {
  core: string[];
  options: TpOption[];
}
interface FactoryOption {
  fillers: string[];
  score: number;
  example: FactoryResult;
}
interface FactoryGroup {
  core: string[];
  options: FactoryOption[];
}
interface OptimizerResults {
  generatedAt: string;
  tradingPostLmd: TpGroup[];
  factoryExp: FactoryGroup[];
  factoryGold: FactoryGroup[];
}

const PAGE_SIZE = 10;
const OPTIONS_PREVIEW = 5;

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="optimizer-pager">
      <button type="button" className="ghost" onClick={() => onPage(0)} disabled={page === 0}>
        « First
      </button>
      <button type="button" className="ghost" onClick={() => onPage(page - 1)} disabled={page === 0}>
        ‹ Prev
      </button>
      <span className="optimizer-pager-status">
        Page {page + 1} of {totalPages}
      </span>
      <button type="button" className="ghost" onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}>
        Next ›
      </button>
      <button type="button" className="ghost" onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1}>
        Last »
      </button>
    </div>
  );
}

function TpGroupCard({ rank, group }: { key?: string | number; rank: number; group: TpGroup }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.options : group.options.slice(0, OPTIONS_PREVIEW);
  const hasCore = group.core.length > 0;
  return (
    <div className="optimizer-group">
      <div className="optimizer-group-header">
        <span className="optimizer-group-rank">#{rank}</span>
        <span className="optimizer-core">{hasCore ? group.core.join(', ') : '(no recurring core)'}</span>
      </div>
      <table className="optimizer-options-table">
        <tbody>
          {shown.map((opt, i) => (
            <tr key={i}>
              <td className="optimizer-options-filler">
                {opt.fillers.length > 0 ? `+ ${opt.fillers.join(', ')}` : hasCore ? '(core alone)' : '(standalone combo)'}
              </td>
              <td>
                {opt.example.effectiveProductivity !== null
                  ? `${(opt.example.effectiveProductivity * 100).toFixed(1)}%`
                  : 'N/A (Pepe bypasses this entirely)'}
              </td>
              <td>{opt.example.effectiveLimit ?? '—'}</td>
              <td>{opt.example.dailyGold.toFixed(1)}</td>
              <td>{opt.example.dailyLmd.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.options.length > OPTIONS_PREVIEW && (
        <button type="button" className="ghost optimizer-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer options' : `Show all ${group.options.length} options`}
        </button>
      )}
    </div>
  );
}

function FactoryGroupCard({ rank, group, scaleExp }: { key?: string | number; rank: number; group: FactoryGroup; scaleExp: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.options : group.options.slice(0, OPTIONS_PREVIEW);
  const hasCore = group.core.length > 0;
  return (
    <div className="optimizer-group">
      <div className="optimizer-group-header">
        <span className="optimizer-group-rank">#{rank}</span>
        <span className="optimizer-core">{hasCore ? group.core.join(', ') : '(no recurring core)'}</span>
      </div>
      <table className="optimizer-options-table">
        <tbody>
          {shown.map((opt, i) => (
            <tr key={i}>
              <td className="optimizer-options-filler">
                {opt.fillers.length > 0 ? `+ ${opt.fillers.join(', ')}` : hasCore ? '(core alone)' : '(standalone combo)'}
              </td>
              <td>{(opt.example.effectiveProductivity * 100).toFixed(1)}%</td>
              <td>{scaleExp ? (opt.example.dailyOutput * 1000).toFixed(0) : opt.example.dailyOutput.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.options.length > OPTIONS_PREVIEW && (
        <button type="button" className="ghost optimizer-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer options' : `Show all ${group.options.length} options`}
        </button>
      )}
    </div>
  );
}

export default function OptimizerPage() {
  const [results, setResults] = useState<OptimizerResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [tpPage, setTpPage] = useState(0);
  const [expPage, setExpPage] = useState(0);
  const [goldPage, setGoldPage] = useState(0);

  useEffect(() => {
    setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    loadCachedResults();
  }, []);

  async function loadCachedResults() {
    setLoading(true);
    try {
      const res = await fetch('/api/optimizer-results');
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
      const res = await fetch('/api/dev/run-optimizer', { method: 'POST', headers: { 'x-dev-passcode': passcode } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
      setTpPage(0);
      setExpPage(0);
      setGoldPage(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Head><title>Optimizer — Arkpedia</title></Head>

      {/* PageHeader, not a bare <header>: its Back gets the page header's room under it
          (.page-header > .back-btn), and the run controls its actions row. */}
      <PageHeader
        back={{ href: '/base', label: 'Base' }}
        eyebrow="Rhodes Island // Base Optimizer"
        title="Optimizer"
        sub={<>
          Best 3-operator setups for maximizing LMD (Trading Post), EXP (Factory, Battle Records), and Precious
          Metals (Factory). All cross-room conditional skills are assumed satisfied -- support operators elsewhere
          never cost a slot in these results. Results are grouped by their most-recurring shared core setup, with
          every viable filler for the remaining slot ranked underneath it, instead of repeating the same core across
          many separate rows.
        </>}
        actions={isLocal ? (
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
        ) : undefined}
      />

      <main className="main-wide">
        {loading && <p>Loading cached results...</p>}
        {error && !results && <p className="sub">{error}</p>}
        {results && (
          <ResultsDisplay
            results={results}
            tpPage={tpPage}
            setTpPage={setTpPage}
            expPage={expPage}
            setExpPage={setExpPage}
            goldPage={goldPage}
            setGoldPage={setGoldPage}
          />
        )}
      </main>
    </>
  );
}

function ResultsDisplay({
  results,
  tpPage,
  setTpPage,
  expPage,
  setExpPage,
  goldPage,
  setGoldPage,
}: {
  results: OptimizerResults;
  tpPage: number;
  setTpPage: (p: number) => void;
  expPage: number;
  setExpPage: (p: number) => void;
  goldPage: number;
  setGoldPage: (p: number) => void;
}) {
  return (
    <>
      <p className="sub">Last computed: {new Date(results.generatedAt).toLocaleString()}</p>

      <section>
        <h2>Best Trading Post Setup (maximize LMD/day)</h2>
        <p className="sub">{results.tradingPostLmd.length} total groups</p>
        {results.tradingPostLmd.slice(tpPage * PAGE_SIZE, tpPage * PAGE_SIZE + PAGE_SIZE).map((group, i) => (
          <TpGroupCard key={tpPage * PAGE_SIZE + i} rank={tpPage * PAGE_SIZE + i + 1} group={group} />
        ))}
        <Pager page={tpPage} totalPages={Math.ceil(results.tradingPostLmd.length / PAGE_SIZE)} onPage={setTpPage} />
      </section>

      <section>
        <h2>Best Factory Setup (maximize EXP/day, Battle Records)</h2>
        <p className="sub">{results.factoryExp.length} total groups</p>
        {results.factoryExp.slice(expPage * PAGE_SIZE, expPage * PAGE_SIZE + PAGE_SIZE).map((group, i) => (
          <FactoryGroupCard key={expPage * PAGE_SIZE + i} rank={expPage * PAGE_SIZE + i + 1} group={group} scaleExp />
        ))}
        <Pager page={expPage} totalPages={Math.ceil(results.factoryExp.length / PAGE_SIZE)} onPage={setExpPage} />
      </section>

      <section>
        <h2>Best Factory Setup (maximize Precious Metals/day)</h2>
        <p className="sub">{results.factoryGold.length} total groups</p>
        {results.factoryGold.slice(goldPage * PAGE_SIZE, goldPage * PAGE_SIZE + PAGE_SIZE).map((group, i) => (
          <FactoryGroupCard key={goldPage * PAGE_SIZE + i} rank={goldPage * PAGE_SIZE + i + 1} group={group} scaleExp={false} />
        ))}
        <Pager page={goldPage} totalPages={Math.ceil(results.factoryGold.length / PAGE_SIZE)} onPage={setGoldPage} />
      </section>
    </>
  );
}