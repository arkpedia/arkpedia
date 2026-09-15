/**
 * The chapter/event filter's headings -- built here rather than in stages.ts so that
 * BOTH sides can build them.
 *
 * The rail on a stage page used to be handed the finished list through
 * getStaticProps. It is the same 24 groups and 150 contents on every stage in the
 * game, which made it 23.1 kB of every one of the 3,786 stage payloads and 87 MB of
 * the static export -- re-downloaded on every stage-to-stage navigation. The rail
 * already fetches /stages-index.json to search across, so it can build the headings
 * from those rows itself and the wire can stop carrying them.
 *
 * Nothing in here touches the filesystem, which is the point: stages.ts does, so a
 * component cannot import it. The three tables the build reads are passed in.
 */
import { StageContentEntry, StageGroup, StageSummary, filterType } from './stageTypes';

export interface NavData {
  /** data/stages-content.json -- only `kind` and `release_date` are read. */
  contents: Record<string, { kind?: string; release_date?: string | null }>;
  /** data/content-windows.json -- [start, end] in unix seconds. */
  windows: Record<string, number[]>;
  /** data/story-groups.json -- the game's own storyline order. */
  storyGroups: { id: string; code: string | null; label: string; mainline?: boolean; contentIds: string[] }[];
}

/** What to call the categories that have no storyline. */
const KIND_LABELS: Record<string, string> = {
  event: 'Events outside a storyline',
  annihilation: 'Annihilation',
  integrated_strategies: 'Integrated Strategies',
  sss: 'Stationary Security Service',
  reclamation: 'Reclamation Algorithm',
  contingency_contract: 'Contingency Contract Battleplan',
  supply: 'Supply',
  guide: 'Tutorial',
  story: 'Main Story',
};
const KIND_ORDER = Object.keys(KIND_LABELS);

/**
 * The chapter/event filter's headings, in the order and wording the game uses.
 *
 * Grouped by CONTENT rather than by stage type, which is the fix for the same
 * chapter appearing under two or three headings: Episode 5 carries main-theme
 * stages, interludes AND a vignette, and grouping by type listed main_5 under
 * each of them. A content appears once now, and `byType` says how many stages it
 * holds of each type so the filter above can still narrow it.
 *
 * The order comes from data/story-groups.json, which scripts/build-story-groups.mjs
 * derives from the game's own storylines table: the main story split into the
 * four acts it names, then its 13 side-story lines (RL The Ark, UR Wildfire, ...)
 * in the game's sortId order. Whatever is in neither -- April Fools' events, duel
 * channels, Annihilation, IS, SSS and so on -- follows, by kind.
 */
export function buildStageGroups(rows: StageSummary[], data: NavData): StageGroup[] {
  const tally = new Map<string, StageContentEntry>();
  for (const s of rows) {
    // Counts what the list shows, which is one row per stage: a Challenge Mode
    // form is reached by the toggle on its base stage, not by its own row.
    if (!s.contentId || s.variantOf) continue;
    let entry = tally.get(s.contentId);
    if (!entry) {
      const window = data.windows[s.contentId];
      entry = {
        id: s.contentId,
        start: window ? window[0] : null,
        end: window ? window[1] : null,
        // No fallback to the content id: 42 contents have no display code and
        // were rendering their raw key in the filter ("camp_zone_9 -- Columbia",
        // "tower_n_05 -- ..."). Every one of them has a proper name.
        label: s.contentLabel || '',
        name: s.contentName || s.contentId,
        count: 0,
        byType: {},
      };
      tally.set(s.contentId, entry);
    }
    entry.count += 1;
    const type = filterType(s.stageType);
    entry.byType[type] = (entry.byType[type] || 0) + 1;
  }

  const groups: StageGroup[] = [];
  const placed = new Set<string>();
  for (const group of data.storyGroups) {
    const contents = group.contentIds
      .map((id) => tally.get(id))
      .filter((c): c is StageContentEntry => !!c);
    if (!contents.length) continue;
    contents.forEach((c) => placed.add(c.id));
    groups.push({
      id: group.id,
      label: group.code ? `${group.code} -- ${group.label}` : group.label,
      mainline: !!group.mainline,
      contents,
    });
  }

  const kinds = data.contents;
  const rest = new Map<string, StageContentEntry[]>();
  for (const entry of tally.values()) {
    if (placed.has(entry.id)) continue;
    const kind = kinds[entry.id]?.kind || 'other';
    const list = rest.get(kind);
    if (list) list.push(entry);
    else rest.set(kind, [entry]);
  }
  const byDate = (a: StageContentEntry, b: StageContentEntry) => {
    const da = kinds[a.id]?.release_date || '';
    const db = kinds[b.id]?.release_date || '';
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  };
  const order = [...KIND_ORDER, ...[...rest.keys()].filter((k) => !KIND_ORDER.includes(k))];
  for (const kind of order) {
    const list = rest.get(kind);
    if (!list?.length) continue;
    groups.push({ id: `kind-${kind}`, label: KIND_LABELS[kind] || kind, mainline: false, contents: list.sort(byDate) });
  }
  return groups;
}
