// Final, static snapshot of the community power-rating poll results,
// computed from the cleaned CSV export after the poll closed. Excludes
// three kinds of anomalous submissions: zero-variance (every operator
// rated identically), duplicate-vector (an exact rating match with
// another submission within 1 hour), and low six-star coverage (fewer
// than 20% of the roster's six-stars rated). Replaces the old runtime
// /api/stats call, which relied on a live database that no longer
// needs to stay up for this page.
//
// THE NUMBERS LIVE IN data/final-poll-results.json. They were 3,469 lines of
// object literal in this file, which made a closed poll's results the third-largest
// source file in the repository and put 126 operators' quartiles through the
// TypeScript compiler on every build. Data belongs in data/, like every other
// dataset here; this file is what gives it names and types.
//
// Still imported by the page rather than read in getStaticProps, deliberately: it
// is ~31 kB either way, and as a module it sits in /results' own chunk, immutable
// and cached, instead of being re-fetched as page data every time the route is
// entered. Moving it to props would have traded the same bytes for a worse cache.
import pollData from '@/data/final-poll-results.json';
import { StatsRow } from '@/lib/types';

interface PollResults {
  submission_count: number;
  rows: StatsRow[];
  /** operator name -> rating -> how many people gave it. */
  histograms: Record<string, Record<string, number>>;
}

const data = pollData as PollResults;

export const FINAL_SUBMISSION_COUNT = data.submission_count;
export const FINAL_STATS_ROWS: StatsRow[] = data.rows;
export const FINAL_HISTOGRAMS: Record<string, Record<string, number>> = data.histograms;
