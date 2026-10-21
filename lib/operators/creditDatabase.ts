import { getAllOperators } from './operators';
import { getAllSkins } from '@/lib/skins/skins';
import { getOperatorArtworkCredits } from './operatorArtworkCredits';
import { getOperatorAppearances } from './operatorAppearances';
import { getOperatorVoiceData } from './operatorVoices';
import { getOperatorIconPath } from './operatorIcon';
import { releaseMarker } from './operatorAvailability';
import { getClassIconPath } from './classBranchIcons';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { ORIGINAL_DESIGN_CREDIT, isPlaceholderCredit } from './creditNames';

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

export function creditDatabase(kind: CreditKind): CreditDatabaseData {
  const people = new Map<string, Map<string, CreditEntry>>();
  const uncredited = new Map<string, CreditEntry>();
  const used = new Map<string, CreditOperator>();
  const add = (person: string, op: ReturnType<typeof getAllOperators>[number], credit: string) => {
    const name = person.trim();
    let rows = uncredited;
    if (!isPlaceholderCredit(name)) {
      rows = people.get(name) ?? new Map();
      people.set(name, rows);
    }
    const row = rows.get(op.name) ?? { name: op.name, credits: [] };
    if (!row.credits.includes(credit)) row.credits.push(credit);
    rows.set(op.name, row);
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
  // Missing source files must fail the build/export rather than publish an empty database.
  if (!people.size) throw new Error(`Cannot build ${kind}: no operator credits in the source data`);
  // The class filter draws each class's glyph from this path, which nothing else guards:
  // a missing file is a blank chip, so it fails the build instead.
  const noGlyph = [...new Set([...used.values()].map(op => op.class).filter((c): c is string => !!c))]
    .filter(c => !publicFileExists(getClassIconPath(c)!));
  if (noGlyph.length) throw new Error(`Cannot build ${kind}: no class icon for ${noGlyph.join(', ')}`);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    people: [...people].map(([name, rows]) => ({ name, operators: [...rows.values()].sort(byName) })).sort(byName),
    uncredited: [...uncredited.values()].sort(byName),
    operators: [...used.values()].sort(byName),
  };
}

/** A content release built before these pages had filters wrote `{ people }` alone, each
 *  person's operators carrying their icon (the old CreditPerson). Until a release built by this
 *  code goes live, the page reads that: upgrade it so it renders, its operators without the
 *  filter fields (rarity, class, faction: unknown) and its placeholder "people" as Uncredited. */
type OldCreditPerson = { name: string; operators: { name: string; icon?: string | null; credits: string[] }[] };
export function upgradeCreditProps(props: CreditDatabaseData | { people: OldCreditPerson[] }): CreditDatabaseData {
  if ('operators' in props && Array.isArray(props.operators) && 'uncredited' in props) return props;
  const people = (props.people ?? []) as OldCreditPerson[];
  const operators = new Map<string, CreditOperator>();
  const entries = (person: OldCreditPerson) => person.operators.map(({ name, icon, credits }) => {
    if (!operators.has(name)) operators.set(name, { name, icon: icon ?? null, rarity: null, class: null, faction: null, umbrellaFactions: [], connectedFactions: [], releasedAt: null });
    return { name, credits };
  });
  const named = people.filter(person => !isPlaceholderCredit(person.name));
  const result: CreditDatabaseData = {
    people: named.map(person => ({ name: person.name, operators: entries(person) })),
    uncredited: people.filter(person => isPlaceholderCredit(person.name)).flatMap(entries),
    operators: [],
  };
  result.operators = [...operators.values()].sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
