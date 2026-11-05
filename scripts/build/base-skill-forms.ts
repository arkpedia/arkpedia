/**
 * The operators a base skill names, in every form the game gives them.
 *
 * An operator with an alternate (Exusiai and Exusiai the New Covenant, W and Wiš'adel) is one family in the
 * game's char_meta_table (spCharGroups), and a skill text that names one of them means exactly what it tags:
 *   - a name wrapped in a glossary term (`<$cc.angel>Exusiai</>`) means every operator the term lists
 *     (gamedata_const termDescriptionDict, "Includes the following Operators"), as one condition;
 *   - a name tagged plain (`<@cc.kw>W</>`) means that single form, and the string picks which one
 *     ("W" is char_113_cqbw, "Wiš'adel" char_1035_wisdel; "SilverAsh the Reignfrost" is the alternate alone).
 * Never by name likeness. The EN and CN texts are read side by side, joined by character id; where they
 * disagree the CN reading decides and the entry's note records the EN one.
 *
 * Sources: the EN and CN gamedata_const.json (the glossary), the CN character_table.json (id to CN name) and
 * char_meta_table.json (the families), through gameTable's candidates; the records give each id its English.
 */
import fs from 'node:fs';
import path from 'node:path';

const URLS = {
  en: 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/',
  cn: 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/',
};

/** Where a game table is, in order: ARKPEDIA_GAMEDATA (a directory of EN tables) and the stage pipeline's EN
 *  cache; ARKPEDIA_CN and the CN tables checkout; else .cache/gamedata/{en,cn}/<file>, which `--fetch` fills. */
function locate(root: string, which: 'en' | 'cn', file: string, given?: string): { found?: string; fallback: string } {
  const candidates = which === 'en'
    ? [process.env.ARKPEDIA_GAMEDATA && path.join(process.env.ARKPEDIA_GAMEDATA, file), path.join(root, '.cache/upstream/en-gamedata/en/gamedata/excel', file)]
    : [process.env.ARKPEDIA_CN && path.join(process.env.ARKPEDIA_CN, 'gamedata/excel', file), path.join(root, '.cache/upstream/cn-tables/zh_CN/gamedata/excel', file)];
  const fallback = path.join(root, '.cache/gamedata', which, file);
  return { found: [given, ...candidates, fallback].find((f): f is string => !!f && fs.existsSync(f)), fallback };
}

/** A game table by name, from where `locate` finds it; `fetch` fills the .cache/gamedata copy first. */
export async function gameTable<T>(root: string, which: 'en' | 'cn', file: string, opts: { fetch?: boolean; given?: string } = {}): Promise<{ file: string; data: T }> {
  if (opts.fetch && !opts.given) {
    const url = URLS[which] + file, fallback = locate(root, which, file).fallback;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, await response.text());
  }
  const { found } = locate(root, which, file, opts.given);
  if (!found) throw new Error(`no ${which} ${file}: set ARKPEDIA_${which === 'en' ? 'GAMEDATA' : 'CN'}, or pass --fetch`);
  return { file: found, data: JSON.parse(fs.readFileSync(found, 'utf8')) as T };
}

/** Whether the four tables the forms need are on disk (tests skip without them). */
export function formsTablesPresent(root: string): boolean {
  return [['en', 'gamedata_const.json'], ['cn', 'gamedata_const.json'], ['cn', 'character_table.json'], ['cn', 'char_meta_table.json']].every(([which, file]) => locate(root, which as 'en' | 'cn', file).found);
}

export interface OperatorForm { id: string; en: string; cn: string }
export interface OperatorForms {
  files: { terms: string; termsCn: string; characters: string; groups: string };
  byId: Map<string, OperatorForm>;
  byEn: Map<string, OperatorForm>;
  byCn: Map<string, OperatorForm>;
  /** The game's alternate families with more than one form, by every member's id, base form first. */
  familyOf: Map<string, OperatorForm[]>;
  /** The glossary's operator lists, by term id, each name as the term writes it. */
  terms: Map<string, { en: string[]; cn: string[] }>;
}

interface Terms { termDescriptionDict: Record<string, { termName: string; description: string }> }
interface Characters { [id: string]: { name: string; isSpChar?: boolean } }
interface Groups { spCharGroups: Record<string, string[]> }

function operatorList(description: string, lang: 'en' | 'cn'): string[] | null {
  const m = /^(?:Includes the following [Oo]perators:?|包含以下干员)\s*\n(.+)$/s.exec(description);
  if (!m) return null;
  // The EN Rainbow Six terms list their members with spaces alone.
  const list = m[1].trim();
  return (lang === 'en' && !/[,，、]/.test(list) ? list.split(/\s+/) : list.split(/[,，、]\s*/)).map((n) => n.trim()).filter(Boolean);
}

/** The families, names and glossary lists, from the game tables and the records (an id with its English name). */
export async function loadOperatorForms(root: string, records: { name: string; internalName?: string | null }[], opts: { fetch?: boolean; terms?: string } = {}): Promise<OperatorForms> {
  const [terms, termsCn, characters, groups] = await Promise.all([
    gameTable<Terms>(root, 'en', 'gamedata_const.json', { fetch: opts.fetch, given: opts.terms }),
    gameTable<Terms>(root, 'cn', 'gamedata_const.json', { fetch: opts.fetch }),
    gameTable<Characters>(root, 'cn', 'character_table.json', { fetch: opts.fetch }),
    gameTable<Groups>(root, 'cn', 'char_meta_table.json', { fetch: opts.fetch }),
  ]);
  const byId = new Map<string, OperatorForm>();
  for (const r of records) if (r.internalName && characters.data[r.internalName] && !/^Amiya \(/.test(r.name)) byId.set(r.internalName, { id: r.internalName, en: r.name, cn: characters.data[r.internalName].name });
  const byEn = new Map([...byId.values()].map((f) => [f.en, f]));
  const byCn = new Map([...byId.values()].map((f) => [f.cn, f]));
  const familyOf = new Map<string, OperatorForm[]>();
  for (const ids of Object.values(groups.data.spCharGroups)) {
    const family = ids.flatMap((id) => byId.get(id) ?? []);
    if (family.length > 1) for (const f of family) familyOf.set(f.id, family);
  }
  const termLists = new Map<string, { en: string[]; cn: string[] }>();
  for (const [id, t] of Object.entries(terms.data.termDescriptionDict)) {
    const en = id.startsWith('cc.') ? operatorList(t.description, 'en') : null;
    if (en) termLists.set(id, { en, cn: [] });
  }
  for (const [id, t] of Object.entries(termsCn.data.termDescriptionDict)) {
    const cn = id.startsWith('cc.') ? operatorList(t.description, 'cn') : null;
    if (cn) termLists.set(id, { en: termLists.get(id)?.en ?? [], cn });
  }
  const rel = (f: string) => path.relative(root, f);
  return { files: { terms: rel(terms.file), termsCn: rel(termsCn.file), characters: rel(characters.file), groups: rel(groups.file) }, byId, byEn, byCn, familyOf, terms: termLists };
}

/** One operator a skill text tags, in the languages that tag it: the string written and the glossary term around it. */
export interface NamedOperator { form: OperatorForm; en?: { string: string; term: string | null }; cn?: { string: string; term: string | null } }

// `<@cc.kw>Name</>`, `<$cc.x>Name</>`, and either inside the other.
const TAGGED = /(?:<\$(cc\.[\w.]+)>|<@cc\.kw>)(?:<\$(cc\.[\w.]+)>|<@cc\.kw>)?([^<]*)<\/>/g;

/** The operators the EN and CN texts of a skill tag, joined by character id; a group term (`cc.g.glasgow`)
 *  around a group name tags no operator. */
export function namedOperators(forms: OperatorForms, enRaw: string | undefined, cnRaw: string | undefined): NamedOperator[] {
  const found = new Map<string, NamedOperator>();
  for (const [lang, raw, byName] of [['en', enRaw, forms.byEn], ['cn', cnRaw, forms.byCn]] as const) {
    if (!raw) continue;
    for (const m of raw.matchAll(TAGGED)) {
      const form = byName.get(m[3].trim());
      if (!form) continue;
      const named = found.get(form.id) ?? found.set(form.id, { form }).get(form.id)!;
      named[lang] ??= { string: m[3].trim(), term: m[1] ?? m[2] ?? null };
    }
  }
  return [...found.values()];
}

export interface FormsDecision {
  /** The record name the condition carries. */
  name: string;
  /** The glossary term the deciding text wraps the name in, or null for a plain name. */
  term: string | null;
  /** Every form the condition counts, the named one first: the term's whole list, or the single name. */
  forms: string[];
  /** The family's other forms the condition does not count. */
  notCounted: string[];
  /** Where EN and CN read differently (CN decided), or a term lists a name no record has. */
  note?: string;
}

/** The forms a named operator counts, by the rule above. */
export function decideForms(forms: OperatorForms, named: NamedOperator): FormsDecision {
  const side = named.cn ? 'cn' : 'en';
  const read = named[side]!;
  const notes: string[] = [];
  let counted = [named.form.en];
  let term: string | null = null;
  const members = (lang: 'en' | 'cn', id: string): { names: string[]; unknown: string[] } | null => {
    const list = forms.terms.get(id)?.[lang];
    if (!list?.length) return null;
    const names = list.map((n) => (lang === 'en' ? forms.byEn : forms.byCn).get(n)?.en ?? null);
    return { names: names.filter((n): n is string => !!n), unknown: list.filter((_, i) => !names[i]) };
  };
  if (read.term) {
    const list = members(side, read.term);
    if (list) {
      term = read.term;
      counted = [named.form.en, ...list.names.filter((n) => n !== named.form.en)];
      if (list.unknown.length) notes.push(`${read.term} also lists ${list.unknown.join(', ')}, which no record names`);
    } else notes.push(`${read.term} wraps ${read.string} without listing operators, so the name alone counts`);
  }
  const other = side === 'cn' ? named.en : undefined;
  if (other) {
    if (!!other.term !== !!read.term) notes.push(`EN ${other.term ? `wraps "${other.string}" in ${other.term}` : `names "${other.string}" plain`} where CN ${read.term ? `wraps it in ${read.term}` : 'names it plain'}; CN decides`);
    else if (other.term && read.term) {
      const en = members('en', other.term)?.names.sort().join(', ');
      const cn = [...counted].sort().join(', ');
      if (en !== cn) notes.push(`${other.term} lists ${en ?? 'nobody'} in EN and ${cn} in CN; CN decides`);
    }
  }
  const family = forms.familyOf.get(named.form.id) ?? [named.form];
  return { name: named.form.en, term, forms: counted, notCounted: family.map((f) => f.en).filter((n) => !counted.includes(n)), ...(notes.length ? { note: notes.join('; ') } : {}) };
}
