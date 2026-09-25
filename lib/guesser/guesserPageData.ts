import { getSkillList } from '@/lib/operators/operatorTypes';
import type { GuesserOperator, Operator } from '@/lib/operators/operatorTypes';
import { portraitStatus } from '@/lib/operators/operatorPortrait';

function pickFields(record: Record<string, string> | null | undefined, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.filter((key) => record?.[key] !== undefined).map((key) => [key, record![key]]));
}

/** Keep only data read by the guesser. In particular, don't send every
 * skill level, cost table and talent upgrade to each visitor. */
export function toGuesserOperator(op: Operator): GuesserOperator {
  return {
    name: op.name,
    rarity: op.rarity,
    class: op.class,
    branch: op.branch,
    faction: op.faction,
    howToObtain: op.howToObtain,
    tags: op.tags,
    isFuture: op.isFuture ?? false,
    ...portraitStatus(op),
    ...(op.releaseAt ? { releaseAt: op.releaseAt } : {}),
    skills: getSkillList(op).map((skill) => {
      const m3 = skill.levels?.find((level) => level.mastery === 3);
      return {
        name: skill.name ?? null,
        icon: skill.icon ?? null,
        levels: m3 ? [{ mastery: m3.mastery, description: m3.description ?? null }] : [],
      };
    }),
    talents: (op.talents || []).map((talent) => ({
      name: talent.name ?? null,
      rows: talent.rows?.length ? [{ description: talent.rows[talent.rows.length - 1].description ?? null }] : [],
    })),
    baseSkills: (op.baseSkills || []).map((skill) => ({ name: skill.name ?? null })),
    basicInfo: pickFields(op.basicInfo, ['Date of Birth', 'Height', 'Infection Status', 'Place of Birth', 'Race']),
    characterInfo: pickFields(op.characterInfo, ['Release Date', 'Operator Record', 'Paradox Simulation']),
    characterVoices: pickFields(op.characterVoices, ['Japanese', 'English', 'Chinese', 'Korean', ...Object.keys(op.characterVoices || {}).filter((key) => key.startsWith('Mandarin'))]),
    ep: typeof op.ep === 'string' ? op.ep : op.ep?.Main ?? null,
  };
}
