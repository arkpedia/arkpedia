/**
 * The shapes of published polls and statistics. Votes and per-person data live in Arkpedia's
 * own database (lib/cloud-account/); arkpedia-data publishes only aggregates:
 *
 *   data/polls/index.json         every poll, open or closed (PollIndex)
 *   data/polls/<id>.json          a closed poll's frozen result (PollResultFile)
 *   data/statistics/index.json    every published statistic, once there is one
 *
 * A rerun of a poll is a new id (power-scale-v2.0); the old result stays published.
 * Published files hold totals only: no account ids, no responses, no per-person timestamps.
 */
export interface PollExclusion {
  id: string;
  /** Which submissions were left out, in a sentence. */
  description: string;
}

export interface PollMethod {
  /** The rating scale, for rating polls. */
  scale?: { min: number; max: number; step: number };
  exclusions: PollExclusion[];
}

export interface PollResultFile<Kind extends string, Results> {
  schema: 1;
  id: string;
  kind: Kind;
  title: string;
  /** YYYY-MM-DD, UTC. */
  opened: string;
  closed: string;
  /** Submissions counted, after the exclusions. */
  submissions: number;
  /** When these numbers were computed (YYYY-MM-DD). */
  generatedAt: string;
  method: PollMethod;
  results: Results;
}

export interface PollIndexEntry {
  id: string;
  title: string;
  kind: string;
  status: 'open' | 'closed';
  opened: string;
  closed: string | null;
  submissions: number | null;
  /** The result file's path under the data root, once the poll has closed. */
  results: string | null;
  /** The page that shows it. */
  page?: string;
}

export interface PollIndex {
  schema: 1;
  polls: PollIndexEntry[];
}
