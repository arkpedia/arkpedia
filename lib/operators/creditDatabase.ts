import { getAllOperators } from './operators';
import { getAllSkins } from '@/lib/skins/skins';
import { getOperatorArtworkCredits } from './operatorArtworkCredits';
import { getOperatorAppearances } from './operatorAppearances';
import { getOperatorVoiceData } from './operatorVoices';
import { getOperatorIconPath } from './operatorIcon';
export interface CreditPerson { name: string; operators: { name: string; icon: string; credits: string[] }[] }
export function creditDatabase(kind: 'artists' | 'voice-actors'): CreditPerson[] {
  const people = new Map<string, Map<string, CreditPerson['operators'][number]>>();
  const add = (person: string, op: ReturnType<typeof getAllOperators>[number], credit: string) => {
    if (!person.trim()) return;
    const rows = people.get(person) ?? new Map();
    const row = rows.get(op.name) ?? { name: op.name, icon: getOperatorIconPath(op), credits: [] };
    if (!row.credits.includes(credit)) row.credits.push(credit);
    rows.set(op.name, row); people.set(person, rows);
  };
  const skins = kind === 'artists' ? getAllSkins() : [];
  for (const op of getAllOperators()) {
    if (kind === 'artists') {
      const credits = getOperatorArtworkCredits(op, getOperatorAppearances(op), skins);
      for (const [outfit, credit] of Object.entries(credits)) {
        if (credit.illustrator) add(credit.illustrator, op, outfit === 'Base' ? 'Operator artwork' : outfit);
        if (credit.originalDesigner) add(credit.originalDesigner, op, 'Original design');
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
  return [...people].map(([name, rows]) => ({ name, operators: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));
}
