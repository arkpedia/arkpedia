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
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';

interface Props {
  iconMap: Record<string, string>;
}

type ViewMode = 'compact' | 'detailed';
type SortKey = 'mean' | 'median' | 'range' | 'n';

/** The Detailed table's columns, in order. A sortable one is a real button in its
 *  header cell, so it is reached with Tab and pressed with Enter or Space, and the
 *  header states the order with aria-sort (GE-11: they were bare <th onClick>). */
const COLUMNS: { label: string; sort?: SortKey }[] = [
  { label: 'Operator' },
  { label: 'Average', sort: 'mean' },
  { label: 'Median', sort: 'median' },
  { label: 'Q1 - Q3' },
  { label: 'Range', sort: 'range' },
  { label: 'Distribution' },
  { label: 'Responses', sort: 'n' },
];

export default function Results({ iconMap }: Props) {
  const rows = FINAL_STATS_ROWS;
  const histograms = FINAL_HISTOGRAMS;
  const submissionCount = FINAL_SUBMISSION_COUNT;
  const [mode, setMode] = useState<ViewMode>('compact');
  const [zoomedRow, setZoomedRow] = useState<StatsRow | null>(null);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);

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

      <PageHeader eyebrow="Rhodes Island // Community Survey" title="Community results" />

      <main className="results-page">
        {!RESULTS_READY && (
          <div className="waiting-box">
            <h2>Results not yet available</h2>
            <p className="hint">Check back once submissions have closed.</p>
          </div>
        )}

        {RESULTS_READY && (
          <>
            <div className="results-toolbar">
              <p className="hint results-count">{submissionCount} submission(s) so far.</p>
              <SegmentedControl<ViewMode>
                label="View"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'detailed', label: 'Detailed' },
                ]}
              />
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
                            className="chip results-chip"
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
              /* The table is wider than a phone (543px of columns in a 342px frame),
                 so it scrolls inside its own box under the site's drawn bar instead of
                 widening the whole page to 567px (GE-02). */
              <div className="sidescroll stats-table-scroll" role="region" aria-label="Results table" tabIndex={0}>
                <table className="stats-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((column) => column.sort ? (
                        <th key={column.label} aria-sort={sortBy === column.sort ? 'descending' : 'none'}>
                          <button type="button" className="btn-bare stats-table-sort" onClick={() => setSortBy(column.sort ?? null)}>
                            {column.label}
                            <span className="stats-table-sort-mark" aria-hidden="true">{sortBy === column.sort ? '▾' : '↕'}</span>
                          </button>
                        </th>
                      ) : (
                        <th key={column.label}>{column.label}</th>
                      ))}
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
                            className="btn-bare stats-table-boxplot-btn"
                            onClick={() => setZoomedRow(r)}
                            title="Click to zoom in"
                            aria-label={`${r.operator_name}: show the distribution`}
                          >
                            <PowerBoxPlot row={r} width={130} height={34} showScaleEnds />
                          </button>
                        </td>
                        <td>{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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