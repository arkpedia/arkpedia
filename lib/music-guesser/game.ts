export const CLIP_SECONDS = [1, 2, 5, 15, 30] as const;

export type ClipStartPosition = 'beginning' | 'middle' | 'random';
export type AnswerMode = 'titles' | 'events' | 'characters' | 'all';
export type MusicPool = 'ingame' | 'library';
export interface SongConnection {
  names: string[];
  characters: string[];
  role: 'lobby' | 'battle' | 'boss' | 'story';
  stages?: string[];
  variant?: string;
  chapter?: number;
  kind?: 'vignette';
  cc?: { series: 'cc' | 'ccb'; number: number };
}

export interface SongChoice {
  id: string;
  title: string;
  altTitle: string | null;
  videoId: string;
  titleAliases?: string[];
  artists?: string[];
  releaseNames?: string[];
  inGame?: boolean;
  connections?: SongConnection[];
  ep?: { characters: string[]; variant?: 'instrumental' | 'intro' };
  groupIds?: string[];
}

/** Exclude explicitly labelled alternate recordings, not ordinary wordless BGM. */
export function isInstrumentalVersion(song: SongChoice): boolean {
  return song.ep?.variant === 'instrumental' || [song.title, song.altTitle || ''].some((title) => /\binstrument(?:al)?\b/i.test(title.normalize('NFKC')));
}

/** Preserve letters in every script; ignore accents, spacing and punctuation.
 * Keep version words and numbers so remixes/parts remain distinct answers. */
export function normalizeTitle(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export function acceptsTitle(song: SongChoice, guess: string): boolean {
  const normalized = normalizeTitle(guess);
  return Boolean(normalized) && [song.title, song.altTitle, ...(song.titleAliases || [])].some((title) => title && normalizeTitle(title) === normalized);
}

export function searchSongs(songs: SongChoice[], query: string): SongChoice[] {
  const normalized = normalizeTitle(query);
  if (!normalized) return [];
  return songs.filter((song) => [song.title, song.altTitle, ...(song.titleAliases || [])].some((title) => title && normalizeTitle(title).includes(normalized)))
    .sort((a, b) => Number(acceptsTitle(b, query)) - Number(acceptsTitle(a, query)) || a.title.localeCompare(b.title))
    .slice(0, 8);
}

export function selectMusicPool(songs: SongChoice[], pool: MusicPool): SongChoice[] {
  return pool === 'ingame' ? songs.filter((song) => song.inGame) : songs;
}

export function getMusicCoverage(songs: SongChoice[]): { events: string[]; vignettes: string[]; chapters: string[]; contracts: string[] } {
  const events = new Set<string>(), vignettes = new Set<string>(), chapters = new Map<number, string>(), contracts = new Map<string, { series: string; number: number; name: string }>();
  for (const song of selectMusicPool(songs, 'ingame')) {
    for (const connection of song.connections || []) {
      if (connection.cc) {
        const { series, number } = connection.cc;
        contracts.set(`${series}:${number}`, { series, number, name: connection.names[0] });
      } else if (connection.chapter !== undefined) chapters.set(connection.chapter, connection.names[0]);
      else if (connection.kind === 'vignette') vignettes.add(connection.names[0]);
      else events.add(connection.names[0]);
    }
  }
  return {
    events: [...events].sort((a, b) => a.localeCompare(b)),
    vignettes: [...vignettes].sort((a, b) => a.localeCompare(b)),
    chapters: [...chapters].sort(([a], [b]) => a - b).map(([, name]) => name),
    contracts: [...contracts.values()].sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number)
      .map(({ series, number, name }) => `${series.toUpperCase()}${number}: ${name}`),
  };
}

export interface AnswerSuggestion { value: string; label: string; detail: string; keys: string[]; kind: 'title' | 'character' | 'event' | 'artist' | 'connection' }
export interface AnswerIndex {
  mode: AnswerMode;
  artists: Map<string, Set<string>>;
  titles: Map<string, Set<string>>;
  connections: Map<string, Set<string>>;
  suggestions: AnswerSuggestion[];
}

/** Filler words are optional only for contextual answers. Title matching stays strict.
 * Keep boss/battle, alter forms, CC/CCB and all numbers distinct. */
export function normalizeConnection(value: string): string {
  return normalizeTitle(value.replace(/\b(event|theme|themes|music|bgm|ost|soundtrack|version)\b/giu, ''));
}

const ROLE_ALIASES: Record<SongConnection['role'], string[]> = {
  lobby: ['lobby', 'menu', 'main menu'], battle: ['battle', 'stage', 'combat'],
  boss: ['boss', 'boss battle', 'boss fight', 'boss stage'], story: ['story', 'cutscene'],
};

export function buildAnswerIndex(songs: SongChoice[], mode: AnswerMode): AnswerIndex {
  const index: AnswerIndex = { mode, artists: new Map(), titles: new Map(), connections: new Map(), suggestions: [] };
  const suggested = new Set<string>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    if (!key) return;
    const ids = map.get(key) || new Set<string>(); ids.add(id); map.set(key, ids);
  };
  const suggest = (item: AnswerSuggestion) => {
    const key = `${item.kind}:${item.kind === 'title' || item.kind === 'artist' ? normalizeTitle(item.value) : normalizeConnection(item.value)}`;
    if (!suggested.has(key)) { suggested.add(key); index.suggestions.push(item); }
  };
  for (const song of songs) {
    const titles = [song.title, song.altTitle, ...(song.titleAliases || [])].filter((title): title is string => Boolean(title));
    for (const title of titles) add(index.titles, normalizeTitle(title), song.id);
    suggest({ value: song.title, label: song.altTitle || song.title, detail: song.altTitle && song.altTitle !== song.title ? `Track title · ${song.title}` : 'Track title', keys: titles.map(normalizeTitle), kind: 'title' });
    if (mode === 'titles') continue;
    if (mode === 'all') {
      for (const name of song.releaseNames || []) {
        const key = normalizeConnection(name);
        add(index.connections, key, song.id);
        suggest({ value: name, label: name, detail: 'Event / release', keys: [key], kind: 'event' });
      }
      for (const artist of song.artists || []) {
        const key = normalizeTitle(artist);
        add(index.artists, key, song.id);
        suggest({ value: artist, label: artist, detail: 'Artist / composer', keys: [key], kind: 'artist' });
      }
    }
    if ((mode === 'characters' || mode === 'all') && song.ep) {
      for (const character of song.ep.characters) {
        if (mode === 'all') {
          const key = normalizeConnection(character);
          add(index.connections, key, song.id);
          suggest({ value: character, label: character, detail: 'Character', keys: [key], kind: 'character' });
        }
        const label = `${character} EP${song.ep.variant ? ` ${song.ep.variant}` : ''}`;
        const keys = [normalizeConnection(label)];
        if (song.ep.variant) keys.push(normalizeConnection(`${character} ${song.ep.variant} EP`));
        for (const key of keys) add(index.connections, key, song.id);
        suggest({ value: label, label, detail: 'Character EP', keys, kind: 'connection' });
      }
    }
    for (const connection of song.connections || []) {
      let subjects = connection.names;
      if (connection.cc) {
        const { series, number } = connection.cc;
        const prefix = series === 'ccb' ? 'Contingency Contract Battleplan' : 'Contingency Contract';
        subjects = connection.names.flatMap((name) => series === 'ccb'
          ? [`CCB ${name}`, `${prefix} ${name}`]
          : [`CC ${name}`, `${prefix} ${name}`, name, `Operation ${name}`]);
        if (mode === 'characters' || mode === 'all') subjects = [...subjects, `${series.toUpperCase()} ${number}`, `${prefix} ${number}`];
      }
      const eventSubjects = new Set(subjects);
      if (!connection.cc && (mode === 'characters' || mode === 'all')) subjects = [...subjects, ...connection.characters];
      const register = (text: string) => add(index.connections, normalizeConnection(text), song.id);
      for (const subject of subjects) {
        if (mode === 'all') {
          const item = { value: subject, label: subject, keys: [normalizeConnection(subject)] };
          if (eventSubjects.has(subject)) suggest({ ...item, detail: connection.chapter !== undefined ? 'Chapter' : 'Event', kind: 'event' });
          if (!connection.cc && connection.characters.includes(subject)) suggest({ ...item, detail: 'Character', kind: 'character' });
        }
        // Index broad and qualified answers against every matching recording.
        register(`${subject} theme`);
        for (const role of ROLE_ALIASES[connection.role]) {
          register(`${subject} ${role} theme`);
          if (connection.variant) {
            register(`${subject} ${role} ${connection.variant} theme`);
            register(`${subject} ${connection.variant} ${role} theme`);
          }
        }
        const label = `${subject} ${connection.role} theme${connection.variant ? ` (${connection.variant})` : ''}`;
        const keys = ROLE_ALIASES[connection.role].flatMap((role) => [normalizeConnection(`${subject} ${role} ${connection.variant || ''}`), normalizeConnection(`${subject} ${connection.variant || ''} ${role}`)]);
        suggest({ value: label, label, detail: connection.chapter !== undefined ? 'Main story connection' : 'Event or character connection', keys, kind: 'connection' });
        for (const stage of connection.stages || []) {
          register(`${subject} ${stage}`); register(`${subject} stage ${stage}`);
          for (const role of ROLE_ALIASES[connection.role]) register(`${subject} ${role} ${stage}`);
        }
      }
      for (const stage of connection.stages || []) {
        register(stage); register(`stage ${stage}`);
        suggest({ value: stage, label: `${stage} theme`, detail: 'Stage connection', keys: [normalizeConnection(stage)], kind: 'connection' });
      }
    }
  }
  return index;
}

export function judgeAnswer(index: AnswerIndex, song: SongChoice, guess: string): 'correct' | 'incorrect' | 'ambiguous' {
  if (index.mode === 'all') {
    // Any valid association wins, including names shared by titles and events.
    return index.titles.get(normalizeTitle(guess))?.has(song.id)
      || index.artists.get(normalizeTitle(guess))?.has(song.id)
      || index.connections.get(normalizeConnection(guess))?.has(song.id) ? 'correct' : 'incorrect';
  }
  // Legacy rules keep exact title precedence and qualified-answer ambiguity.
  const titled = index.titles.get(normalizeTitle(guess));
  if (titled) return titled.has(song.id) ? 'correct' : 'incorrect';
  const matches = index.connections.get(normalizeConnection(guess));
  if (matches && matches.size > 1) return 'ambiguous';
  return matches?.has(song.id) ? 'correct' : 'incorrect';
}

export function searchAnswers(index: AnswerIndex, query: string): AnswerSuggestion[] {
  const title = normalizeTitle(query), connection = normalizeConnection(query);
  if (!title) return [];
  const priority: Record<AnswerSuggestion['kind'], number> = { title: 0, character: 1, event: 2, artist: 3, connection: 4 };
  const rank = (item: AnswerSuggestion) => {
    const key = item.kind === 'title' || item.kind === 'artist' ? title : connection;
    if (!key) return 3;
    if (item.keys.includes(key)) return 0;
    if (item.keys.some((candidate) => candidate.startsWith(key))) return 1;
    return item.keys.some((candidate) => candidate.includes(key)) ? 2 : 3;
  };
  return index.suggestions.map((item) => ({ item, rank: rank(item) })).filter((result) => result.rank < 3)
    .sort((a, b) => a.rank - b.rank || priority[a.item.kind] - priority[b.item.kind] || a.item.label.localeCompare(b.item.label))
    .slice(0, 8).map(({ item }) => item);
}

export function pickSong(songs: SongChoice[], recent: string[], random = Math.random): SongChoice | null {
  const fresh = songs.filter((song) => !recent.includes(song.id));
  const pool = fresh.length ? fresh : songs.filter((song) => song.id !== recent[recent.length - 1]);
  const available = pool.length ? pool : songs;
  return available.length ? available[Math.min(available.length - 1, Math.floor(random() * available.length))] : null;
}

export interface Attempt { title: string; correct: boolean; seconds: number }
export interface Round { song: SongChoice; attempts: Attempt[]; clipIndex: number; status: 'playing' | 'won' | 'revealed' }

export function clipStage(round: Round | null): number {
  return round?.clipIndex ?? 0;
}

/** Clue selection is independent of guesses, including when revisiting a shorter clue. */
export function selectClip(round: Round, index: number): Round {
  if (!Number.isInteger(index) || index < 0 || index >= CLIP_SECONDS.length || index === round.clipIndex) return round;
  return { ...round, clipIndex: index };
}

export function makeAttempt(round: Round, title: string | null, index?: AnswerIndex): Round {
  if (round.status !== 'playing') return round;
  if (title === null) return selectClip(round, Math.min(CLIP_SECONDS.length - 1, round.clipIndex + 1));
  if (!normalizeTitle(title)) return round;
  const answerKey = (value: string) => index && !index.titles.has(normalizeTitle(value)) && !index.artists.has(normalizeTitle(value)) ? `connection:${normalizeConnection(value)}` : `title:${normalizeTitle(value)}`;
  if (round.attempts.some((attempt) => answerKey(attempt.title) === answerKey(title))) return round;
  const judgment = index ? judgeAnswer(index, round.song, title) : acceptsTitle(round.song, title) ? 'correct' : 'incorrect';
  if (judgment === 'ambiguous') return round;
  const correct = judgment === 'correct';
  const attempts = [...round.attempts, { title, correct, seconds: CLIP_SECONDS[round.clipIndex] }];
  return { ...round, attempts, status: correct ? 'won' : 'playing' };
}

/** Seek offsets are always relative to the chosen excerpt and inside the clue. */
export function clampClipPosition(position: number, duration: number): number {
  return Math.max(0, Math.min(Number.isFinite(duration) ? duration : 0, Number.isFinite(position) ? position : 0));
}

/** Sample the selected range while reserving the full longest clue. Short
 * tracks fall back to the beginning so every available second stays playable. */
export function randomClipStart(duration: number, point: number, range: Exclude<ClipStartPosition, 'beginning'> = 'random'): number {
  if (!Number.isFinite(duration) || duration <= CLIP_SECONDS[CLIP_SECONDS.length - 1]) return 0;
  const latest = duration - CLIP_SECONDS[CLIP_SECONDS.length - 1];
  const first = range === 'middle' ? Math.min(duration * 0.25, latest) : 0;
  const last = range === 'middle' ? Math.min(duration * 0.75, latest) : latest;
  return first + (last - first) * clampClipPosition(point, 1);
}
