import { getAllOperators } from './operators';
import { getAllSkins } from '@/lib/skins/skins';
import { getOperatorArtworkCredits } from './operatorArtworkCredits';
import { getOperatorAppearances } from './operatorAppearances';
import { getOperatorVoiceData } from './operatorVoices';
import { getOperatorIconPath } from './operatorIcon';
import { releaseMarker } from './operatorAvailability';
import { getClassIconPath } from './classBranchIcons';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { CREDIT_NAME_SPELLINGS, ORIGINAL_DESIGN_CREDIT, canonicalCreditSpelling, creditNameKey, creditedPeople, isPlaceholderCredit } from './creditNames';

/** One operator a person is credited on, and for what: the outfits an artist drew
 *  ("Operator artwork", "Elite 2", an outfit's name, "Original design"), or the
 *  languages a voice actor recorded ("Japanese"). */
export interface CreditEntry { name: string; credits: string[] }
export interface CreditPerson { name: string; operators: CreditEntry[] }

/** What the filters need to know about a credited operator. The release is a marker, not a
 *  decision: the page judges it against the reader's clock (isReleasedAt), since a decision
 *  made here would freeze the export's moment into the content release. */
export interface CreditOperator {
  name: string;
  /** Null when the asset index has no icon for it yet (a CN-only operator may have none). */
  icon: string | null;
  rarity: number | null;
  class: string | null;
  faction: string | null;
  umbrellaFactions: string[];
  connectedFactions: string[];
  releasedAt: number | null;
  isFuture?: true;
}

export interface CreditDatabaseData {
  people: CreditPerson[];
  /** Operators whose credit is a placeholder in the source ("-"): not a person, so they are
   *  listed once, under Uncredited, never as someone's card. */
  uncredited: CreditEntry[];
  /** Every operator people and uncredited name, by name, in name order. */
  operators: CreditOperator[];
}

export type CreditKind = 'artists' | 'voice-actors';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function credit(rows: Map<string, CreditEntry>, operator: string, labels: readonly string[]) {
  const row = rows.get(operator) ?? { name: operator, credits: [] };
  for (const label of labels) if (!row.credits.includes(label)) row.credits.push(label);
  rows.set(operator, row);
}

/** One card per person, from cards a source string named: a joined name ("Lowro & Studio
 *  Montagne") becomes each of its people, a "(credited as ...)" note the person it is about,
 *  a placeholder Uncredited, and names differing only in case one card under the reviewed
 *  spelling (canonicalCreditSpelling). The builder and a release built before this rule
 *  (upgradeCreditProps) both go through it, so every page the site serves is clean. */
function mergePeople(people: readonly CreditPerson[], uncreditedIn: readonly CreditEntry[]) {
  const groups = new Map<string, { spellings: Map<string, Set<string>>; rows: Map<string, CreditEntry> }>();
  const uncredited = new Map<string, CreditEntry>();
  for (const entry of uncreditedIn) credit(uncredited, entry.name, entry.credits);
  for (const person of people) {
    const names = creditedPeople(person.name);
    if (!names.length) for (const entry of person.operators) credit(uncredited, entry.name, entry.credits);
    for (const name of names) {
      const group = groups.get(creditNameKey(name)) ?? { spellings: new Map(), rows: new Map() };
      groups.set(creditNameKey(name), group);
      const operators = group.spellings.get(name) ?? new Set();
      group.spellings.set(name, operators);
      for (const entry of person.operators) {
        operators.add(entry.name);
        credit(group.rows, entry.name, entry.credits);
      }
    }
  }
  const merged = [...groups.values()].map(group => {
    const name = canonicalCreditSpelling(new Map([...group.spellings].map(([spelling, ops]) => [spelling, ops.size])));
    return { name, spellings: [...group.spellings.keys()].sort(), operators: [...group.rows.values()].sort(byName) };
  }).sort(byName);
  return { merged, uncredited: [...uncredited.values()].sort(byName) };
}

/** Whether every card is already one person under its reviewed spelling. */
function namesAreClean(people: readonly CreditPerson[]): boolean {
  const keys = new Set<string>();
  for (const { name } of people) {
    const names = creditedPeople(name);
    const key = creditNameKey(name);
    if (names.length !== 1 || names[0] !== name || keys.has(key)) return false;
    if (CREDIT_NAME_SPELLINGS[key] && CREDIT_NAME_SPELLINGS[key] !== name) return false;
    keys.add(key);
  }
  return true;
}

interface Collected {
  /** Each person as its source string spelled them, before mergePeople. */
  people: CreditPerson[];
  uncredited: CreditEntry[];
  used: Map<string, CreditOperator>;
}

function collect(kind: CreditKind): Collected {
  const people = new Map<string, Map<string, CreditEntry>>();
  const used = new Map<string, CreditOperator>();
  const add = (source: string, op: ReturnType<typeof getAllOperators>[number], label: string) => {
    const name = source.trim();
    const rows = people.get(name) ?? new Map<string, CreditEntry>();
    people.set(name, rows);
    credit(rows, op.name, [label]);
    if (!used.has(op.name)) {
      const icon = getOperatorIconPath(op);
      used.set(op.name, {
        name: op.name,
        icon: publicFileExists(decodeURIComponent(icon)) ? icon : null,
        rarity: op.rarity,
        class: op.class,
        faction: op.faction,
        umbrellaFactions: op.umbrellaFactions ?? [],
        connectedFactions: op.connectedFactions ?? [],
        ...releaseMarker(op),
      });
    }
  };
  const skins = kind === 'artists' ? getAllSkins() : [];
  for (const op of getAllOperators()) {
    if (kind === 'artists') {
      const credits = getOperatorArtworkCredits(op, getOperatorAppearances(op), skins);
      for (const [outfit, credit] of Object.entries(credits)) {
        if (credit.illustrator) add(credit.illustrator, op, outfit === 'Base' ? 'Operator artwork' : outfit);
        if (credit.originalDesigner) add(credit.originalDesigner, op, ORIGINAL_DESIGN_CREDIT);
      }
    } else {
      const voice = getOperatorVoiceData(op.internalName);
      for (const set of voice ? [voice, ...(voice.skinVoices ?? [])] : []) {
        for (const pack of set.packs.filter(pack => pack.status === 'current')) for (const actor of pack.actors) add(actor, op, pack.label);
      }
    }
  }
  return { people: [...people].map(([name, rows]) => ({ name, operators: [...rows.values()] })), uncredited: [], used };
}

/** Names the sources spell more than one way, by the spelling shown: what the merge did,
 *  for the test that holds every such pair to the reviewed list (CREDIT_NAME_SPELLINGS). */
export function creditNameVariants(kind: CreditKind): Map<string, string[]> {
  const { people, uncredited } = collect(kind);
  return new Map(mergePeople(people, uncredited).merged.filter(p => p.spellings.length > 1).map(p => [p.name, p.spellings]));
}

export function creditDatabase(kind: CreditKind): CreditDatabaseData {
  const collected = collect(kind);
  const { merged, uncredited } = mergePeople(collected.people, collected.uncredited);
  const used = collected.used;
  // Missing source files must fail the build/export rather than publish an empty database.
  if (!merged.length) throw new Error(`Cannot build ${kind}: no operator credits in the source data`);
  // The class filter draws each class's glyph from this path, which nothing else guards:
  // a missing file is a blank chip, so it fails the build instead.
  const noGlyph = [...new Set([...used.values()].map(op => op.class).filter((c): c is string => !!c))]
    .filter(c => !publicFileExists(getClassIconPath(c)!));
  if (noGlyph.length) throw new Error(`Cannot build ${kind}: no class icon for ${noGlyph.join(', ')}`);
  return {
    people: merged.map(({ name, operators }) => ({ name, operators })),
    uncredited,
    operators: [...used.values()].sort(byName),
  };
}

/** A content release built before these pages had filters wrote `{ people }` alone, each
 *  person's operators carrying their icon (the old CreditPerson). Until a release built by this
 *  code goes live, the page reads that: upgrade it so it renders, its operators without the
 *  filter fields (rarity, class, faction: unknown) and its placeholder "people" as Uncredited. */
type OldCreditPerson = { name: string; operators: { name: string; icon?: string | null; credits: string[] }[] };
export function upgradeCreditProps(props: CreditDatabaseData | { people: OldCreditPerson[] }): CreditDatabaseData {
  // Either shape goes through mergePeople: a release compiled before the name rule still
  // carries "Lowro & Studio Montagne" and "ASK" beside "Ask" until the next one goes live.
  if ('operators' in props && Array.isArray(props.operators) && 'uncredited' in props) {
    if (namesAreClean(props.people)) return props;
    const { merged, uncredited } = mergePeople(props.people, props.uncredited);
    return { ...props, people: merged.map(({ name, operators }) => ({ name, operators })), uncredited };
  }
  const people = (props.people ?? []) as OldCreditPerson[];
  const operators = new Map<string, CreditOperator>();
  const entries = (person: OldCreditPerson) => person.operators.map(({ name, icon, credits }) => {
    if (!operators.has(name)) operators.set(name, { name, icon: icon ?? null, rarity: null, class: null, faction: null, umbrellaFactions: [], connectedFactions: [], releasedAt: null });
    return { name, credits };
  });
  const named = people.filter(person => !isPlaceholderCredit(person.name));
  const { merged, uncredited } = mergePeople(
    named.map(person => ({ name: person.name, operators: entries(person) })),
    people.filter(person => isPlaceholderCredit(person.name)).flatMap(entries),
  );
  return {
    people: merged.map(({ name, operators }) => ({ name, operators })),
    uncredited,
    operators: [...operators.values()].sort(byName),
  };
}
