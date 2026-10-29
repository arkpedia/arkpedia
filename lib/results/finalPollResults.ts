// Final, static snapshot of the community power-rating poll results,
// computed from the cleaned CSV export after the poll closed. Excludes
// three kinds of anomalous submissions: zero-variance (every operator
// rated identically), duplicate-vector (an exact rating match with
// another submission within 1 hour), and low six-star coverage (fewer
// than 20% of the roster's six-stars rated). Replaces the old runtime
// /api/stats call, which relied on a live database that no longer
// needs to stay up for this page.
//
// THE NUMBERS LIVE IN arkpedia-data, at data/polls/power-scale-v1.0.json (fetched into
// data/ by scripts/content/pull-data.mjs, like every other record). The exclusions above are
// in that file's `method` too. They were 3,469 lines of object literal here once; the file's
// envelope is the one every published poll shares (lib/polls/types.ts).
//
// Still imported by the page rather than read in getStaticProps, deliberately: it
// is ~33 kB either way, and as a module it sits in /results' own chunk, immutable
// and cached, instead of being re-fetched as page data every time the route is
// entered. Moving it to props would have traded the same bytes for a worse cache.
import pollData from '@/data/polls/power-scale-v1.0.json';
import type { PollResultFile } from '@/lib/polls/types';
import { StatsRow } from '@/lib/results/types';

export interface PowerScaleResults {
  rows: StatsRow[];
  /** operator name -> rating -> how many people gave it. */
  histograms: Record<string, Record<string, number>>;
}

const poll = pollData as PollResultFile<'operator-rating', PowerScaleResults>;

export const FINAL_SUBMISSION_COUNT = poll.submissions;
export const FINAL_STATS_ROWS: StatsRow[] = poll.results.rows;
export const FINAL_HISTOGRAMS: Record<string, Record<string, number>> = poll.results.histograms;
