import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import { useMemo, useState } from 'react';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { StatsRow, POWER_VALUES } from '@/lib/survey/types';
import { RESULTS_READY } from '@/lib/config/siteConfig';
import { FINAL_STATS_ROWS, FINAL_HISTOGRAMS, FINAL_SUBMISSION_COUNT } from '@/lib/results/finalPollResults';
import PowerBoxPlot from '@/components/survey/PowerBoxPlot';
import PowerDistributionCurve from '@/components/survey/PowerDistributionCurve';

interface Props {
  iconMap: Record<string, string>;
}

type ViewMode = 'compact' | 'detailed';

export default function Results({ iconMap }: Props) {
  const rows = FINAL_STATS_ROWS;
  const histograms = FINAL_HISTOGRAMS;
  const submissionCount = FINAL_SUBMISSION_COUNT;
  const [mode, setMode] = useState<ViewMode>('compact');
  const [zoomedRow, setZoomedRow] = useState<StatsRow | null>(null);
  const [sortBy, setSortBy] = useState<'mean' | 'median' | 'range' | 'n' | null>(null);

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = sortBy === 'range' ? a.q3 - a.q1 : sortBy === 'n' ? a.n : sortBy === 'median' ? a.median : a.mean;
      const bVal = sortBy === 'range' ? b.q3 - b.q1 : sortBy === 'n' ? b.n : sortBy === 'median' ? b.median : b.mean;
      return bVal - aVal; // highest to lowest
    });
    return copy;
  }, [rows, sortBy]);

  // Group operators into tier rows by their average, rounded to the nearest
  // 0.1. Rows with no operators are skipped entirely (read-only view, no
  // "add row" affordance needed here).
  const compactGroups = useMemo(() => {
    const groups: Record<string, StatsRow[]> = {};
    rows.forEach((r) => {
      const rounded = (Math.round(r.mean * 10) / 10).toFixed(1);
      const clamped = POWER_VALUES.includes(rounded)
        ? rounded
        : r.mean >= parseFloat(POWER_VALUES[0])
        ? POWER_VALUES[0]
        : POWER_VALUES[POWER_VALUES.length - 1];
      if (!groups[clamped]) groups[clamped] = [];
      groups[clamped].push(r);
    });
    return groups;
  }, [rows]);

  return (
    <>
      <Head><title>Community Results — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Personnel Archive</div>
        <h1>Community results</h1>
      </header>

      <main>
        {!RESULTS_READY && (
          <div className="waiting-box">
            <h2>Results not yet available</h2>
            <p className="hint">Check back once submissions have closed.</p>
          </div>
        )}

        {RESULTS_READY && (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="hint" style={{ margin: 0 }}>{submissionCount} submission(s) so far.</p>
                  <div className="view-toggle">
                    <button
                      type="button"
                      className={mode === 'compact' ? 'primary' : 'ghost'}
                      onClick={() => setMode('compact')}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      className={mode === 'detailed' ? 'primary' : 'ghost'}
                      onClick={() => setMode('detailed')}
                    >
                      Detailed
                    </button>
                  </div>
                </div>

                {mode === 'compact' && (
                  <div>
                    {POWER_VALUES.map((value) => {
                      const group = compactGroups[value];
                      if (!group || group.length === 0) return null;
                      return (
                        <div key={value} className="tier-row">
                          <div className="tier-label">{value}</div>
                          <div className="tier-drop">
                            {group.map((r) => (
                              <button
                                key={r.operator_name}
                                type="button"
                                className="chip"
                                style={{ padding: 0 }}
                                title={`${r.operator_name} (avg ${r.mean}) -- click to view distribution`}
                                onClick={() => setZoomedRow(r)}
                              >
                                <Image src={iconMap[r.operator_name]} alt={r.operator_name} width={72} height={72} />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {mode === 'detailed' && (
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Operator</th>
                        <th className="stats-table-sortable" onClick={() => setSortBy('mean')}>
                          Average {sortBy === 'mean' && '▾'}
                        </th>
                        <th className="stats-table-sortable" onClick={() => setSortBy('median')}>
                          Median {sortBy === 'median' && '▾'}
                        </th>
                        <th>Q1 - Q3</th>
                        <th className="stats-table-sortable" onClick={() => setSortBy('range')}>
                          Range {sortBy === 'range' && '▾'}
                        </th>
                        <th>Distribution</th>
                        <th className="stats-table-sortable" onClick={() => setSortBy('n')}>
                          Responses {sortBy === 'n' && '▾'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((r) => (
                        <tr key={r.operator_name}>
                          <td>
                            <Image src={iconMap[r.operator_name]} alt={r.operator_name} width={28} height={28} />
                            {r.operator_name}
                          </td>
                          <td>{r.mean}</td>
                          <td>{r.median}</td>
                          <td>{r.q1} - {r.q3}</td>
                          <td>{(r.q3 - r.q1).toFixed(1)}</td>
                          <td>
                            <button
                              type="button"
                              className="stats-table-boxplot-btn"
                              onClick={() => setZoomedRow(r)}
                              title="Click to zoom in"
                            >
                              <PowerBoxPlot row={r} width={130} height={34} showScaleEnds />
                            </button>
                          </td>
                          <td>{r.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
          </>
        )}
      </main>

      {zoomedRow && (
        <div className="modal-overlay" onClick={() => setZoomedRow(null)}>
          <div className="modal-box boxplot-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-back-btn" onClick={() => setZoomedRow(null)}>
              ‹ Back
            </button>
            <div className="boxplot-zoom-header">
              <Image src={iconMap[zoomedRow.operator_name]} alt={zoomedRow.operator_name} width={48} height={48} />
              <div>
                <h2 style={{ margin: 0 }}>{zoomedRow.operator_name}</h2>
                <p className="hint" style={{ margin: 0 }}>
                  {zoomedRow.n} response(s) · mean {zoomedRow.mean} · median {zoomedRow.median}
                </p>
              </div>
            </div>
            <h3 style={{ marginTop: 18, marginBottom: 6 }}>Box Plot</h3>
            <PowerBoxPlot row={zoomedRow} width={560} height={86} showLabel={false} showGridlines />
            <h3 style={{ marginTop: 18, marginBottom: 6 }}>Response Distribution</h3>
            <PowerDistributionCurve histogram={histograms[zoomedRow.operator_name] || {}} width={560} height={176} showGridlines />
            <div className="boxplot-zoom-stats">
              <div>
                <span className="boxplot-zoom-stat-label">5th pct</span>
                <span className="boxplot-zoom-stat-value">{zoomedRow.p5}</span>
              </div>
              <div>
                <span className="boxplot-zoom-stat-label">Q1</span>
                <span className="boxplot-zoom-stat-value">{zoomedRow.q1}</span>
              </div>
              <div>
                <span className="boxplot-zoom-stat-label">Median</span>
                <span className="boxplot-zoom-stat-value">{zoomedRow.median}</span>
              </div>
              <div>
                <span className="boxplot-zoom-stat-label">Q3</span>
                <span className="boxplot-zoom-stat-value">{zoomedRow.q3}</span>
              </div>
              <div>
                <span className="boxplot-zoom-stat-label">95th pct</span>
                <span className="boxplot-zoom-stat-value">{zoomedRow.p95}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const iconMap: Record<string, string> = {};
  for (const op of getAllOperators()) {
    iconMap[op.name] = getOperatorIconPath(op);
  }
  return { props: { iconMap } };
};