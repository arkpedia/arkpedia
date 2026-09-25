/**
 * Size budgets for what the guessers and the palette game send to the browser, measured on the real catalogue.
 *
 * Each budget is a ceiling on bytes a reader downloads: a page's props, or a catalogue the
 * page loads. They exist to catch a code change that ships whole records where a projection
 * was meant (the operator guesser's comment said as much), and they sat in `npm test`. That
 * suite also runs in the release job's Validate step, against the day's data, and the
 * catalogues behind them only grow: the albums stage appends every new Monster Siren song
 * by itself, operators and stages arrive with every patch. The music guesser's catalogue
 * stood at 48,322 of 50,000 bytes and the operator guesser at 152,283 of 163,840 on
 * 2026-09-25, so an ordinary month of new songs or operators would have failed `npm test`
 * there, and with it that day's release and every one after, with no record at fault.
 *
 * So the budgets live here, and nothing in `npm test` measures real data. Two callers:
 *
 *   npm run check:payload-budgets   Check (every pull request and push to main) fails
 *                                   when a payload is over. A person is there, and a code
 *                                   change that bloats a payload is made there.
 *   stage payload-budgets           The release job runs the same command as a refresh
 *                                   stage, after every stage that adds records. Over
 *                                   budget, only that stage fails: it writes nothing, the
 *                                   stage runner keeps a `stage:payload-budgets` hold in
 *                                   data/quarantine.json, the daily 'Content quarantined'
 *                                   issue names it (overdue after three days) with this
 *                                   script's output, and the release publishes. Growth is
 *                                   reported every day until someone trims the payload or
 *                                   raises the budget with a reason; it never costs a
 *                                   release.
 */
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { getSongChoices } from '../../lib/music-guesser/catalogue';
import type { SongChoice } from '../../lib/music-guesser/game';
import { getMusicSelectionCatalogue } from '../../lib/music-guesser/selectionCatalogue';
import { getRecruitmentGameData } from '../../lib/minigames/recruitmentData';
import { getAllOperators } from '../../lib/operators/operators';
import { getAllSkins } from '../../lib/skins/skins';
import { toGuesserOperator } from '../../lib/guesser/guesserPageData';
import { buildStageGuesserCatalogue } from '../../lib/minigames/stageGuesserData';
import { getPaletteCatalogue } from '../../lib/minigames/data';

export type Unit = 'gzip' | 'raw';
export interface PayloadBudget {
  name: string;
  /** Where readers download it. */
  shipped: string;
  unit: Unit;
  limit: number;
  /** Why the ceiling is where it is. */
  why: string;
}
export interface Measured extends PayloadBudget { bytes: number }

/** The bytes a value costs as JSON, compressed the way it is served or as written. */
export function payloadBytes(value: unknown, unit: Unit): number {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return unit === 'gzip' ? gzipSync(json).length : Buffer.byteLength(json);
}

// The music guesser's two budgets, as functions of the song list so a test can grow it.
export const musicCataloguePayload = (songs: SongChoice[]) => songs;
export const musicSelectionPayload = (songs: SongChoice[]) => getMusicSelectionCatalogue(songs);

export const MUSIC_CATALOGUE: PayloadBudget = { name: 'music guesser catalogue', shipped: '/games/music-guesser props (songs)', unit: 'gzip', limit: 50_000,
  why: 'every song with its artist names, searched as the reader types' };
export const MUSIC_SELECTION: PayloadBudget = { name: 'music guesser selection', shipped: '/games/music-guesser props', unit: 'gzip', limit: 65_000,
  why: 'the group metadata must stay small alongside the catalogue' };
const RECRUITMENT: PayloadBudget = { name: 'recruitment guesser data', shipped: '/games/recruitment-guesser props', unit: 'gzip', limit: 30_000,
  why: 'compact questions and released recruitable answers only' };
const OPERATOR_RAW: PayloadBudget = { name: 'operator guesser props (raw)', shipped: '/games/operator-guesser props', unit: 'raw', limit: 850 * 1024,
  why: 'modest catalogue growth, while catching an accidental full-record import' };
const OPERATOR_GZIP: PayloadBudget = { ...OPERATOR_RAW, name: 'operator guesser props (gzip)', unit: 'gzip', limit: 160 * 1024 };
const STAGE_ANSWERS: PayloadBudget = { name: 'stage guesser catalogue', shipped: 'stage-guesser/catalogue.json (entries and answers)', unit: 'gzip', limit: 200_000,
  why: 'full answer search stays a compact lazy payload' };
const STAGE_ENTRIES: PayloadBudget = { name: 'stage guesser entries', shipped: 'stage-guesser/catalogue.json (entries)', unit: 'gzip', limit: 150_000,
  why: 'the lazy catalogue stays under 150 KB gzip' };
const STAGE_SETUP: PayloadBudget = { name: 'stage guesser setup', shipped: '/games/stage-guesser props (groups)', unit: 'raw', limit: 30_000,
  why: 'the initial page carries only setup metadata' };
const PALETTES: PayloadBudget = { name: 'color palette catalogue', shipped: '/games/color-palette props', unit: 'gzip', limit: 65_000,
  why: 'the page ships the whole catalogue and filters it at render' };

/** Every budget, measured on the data under the working directory. */
export function measurePayloads(): Measured[] {
  const songs = getSongChoices();
  const operatorProps = JSON.stringify({
    operators: getAllOperators().map(toGuesserOperator),
    skins: getAllSkins().map(({ name, model, illustrator }) => ({ name, model, illustrator })),
  });
  const { entries, answers, groups } = buildStageGuesserCatalogue();
  const rows: [PayloadBudget, unknown][] = [
    [MUSIC_CATALOGUE, musicCataloguePayload(songs)],
    [MUSIC_SELECTION, musicSelectionPayload(songs)],
    [RECRUITMENT, getRecruitmentGameData()],
    [OPERATOR_RAW, operatorProps],
    [OPERATOR_GZIP, operatorProps],
    [STAGE_ANSWERS, { entries, answers }],
    [STAGE_ENTRIES, entries],
    [STAGE_SETUP, { groups }],
    [PALETTES, getPaletteCatalogue()],
  ];
  return rows.map(([budget, value]) => ({ ...budget, bytes: payloadBytes(value, budget.unit) }));
}

/** What the check prints and how it exits, for measurements already taken. */
export function checkPayloadBudgets(measured: Measured[]) {
  const out: string[] = [], errors: string[] = [];
  const over = measured.filter((row) => row.bytes >= row.limit);
  for (const row of measured) {
    out.push(`${row.bytes >= row.limit ? 'OVER' : 'ok  '} ${row.name}: ${row.bytes} of ${row.limit} bytes ${row.unit} (${Math.round((row.bytes / row.limit) * 100)}%), ${row.shipped}`);
  }
  if (over.length) {
    for (const row of over) errors.push(`  ${row.name}: ${row.bytes} bytes ${row.unit}, budget ${row.limit} (${row.why})`);
    errors.push('Trim what the page ships, or raise the budget in scripts/audits/check-payload-budgets.ts and say why. '
      + '(In the release job this is the payload-budgets stage: a hold in the daily issue, never a lost release.)');
    // Last, because the stage report and the daily issue quote a failed stage's last line.
    errors.push(`${over.length} payload(s) over budget: ${over.map((row) => `${row.name} ${row.bytes} of ${row.limit} bytes ${row.unit}`).join('; ')}`);
  }
  return { exitCode: over.length ? 1 : 0, out, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, out, errors } = checkPayloadBudgets(measurePayloads());
  for (const line of out) console.log(line);
  for (const line of errors) console.error(line);
  process.exit(exitCode);
}
