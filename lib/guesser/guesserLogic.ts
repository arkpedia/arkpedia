import { GuesserOperator, getSkillList, getWelfareInfo, HowToObtainInfo } from '@/lib/operators/operatorTypes';
import { Hint, HintType } from './guesserTypes';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';

// Lightweight projection of Skin for the guesser -- verified against
// every s.*/skin.* access in this file. The full Skin type carries
// image paths, descriptions, prices, and availability data that no
// hint here actually reads.
export interface GuesserSkin {
  name: string;
  model: string | null;
  illustrator: string | null;
}

export const NOT_AVAILABLE = 'Not available (might be a hint!)';

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Masks every occurrence of the operator's own name within hint text,
 * so a skin name, talent name, module blurb, or skill description
 * can't just hand the answer straight to the player. Checks both the
 * full name and, for names with a " the " epithet (e.g. "SilverAsh
 * the Reignfrost"), the base name alone too, since flavor text
 * usually refers to operators by just that shorter form. */
function redactOperatorName(text: string, operatorName: string): string {
  if (!text) return text;
  const variants = [operatorName];
  const theIdx = operatorName.indexOf(' the ');
  if (theIdx > 0) variants.push(operatorName.slice(0, theIdx));

  let result = text;
  for (const variant of variants) {
    if (!variant) continue;
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'gi');
    result = result.replace(pattern, (match) => '█'.repeat(match.length));
  }
  return result;
}

/** operator.howToObtain in the real data is an object with each
 * obtain method as its own Yes/No field:
 *   { Limited, 'Standard Headhunting', 'Kernel Headhunting',
 *     Recruitment, Welfare, 'Shop Operator' }
 * Checks which say "Yes" and returns the ones that do, using "Limited
 * Headhunting" as the display label when Limited is Yes. Shop
 * Operator is deliberately never included, regardless of its value.
 * Also handles a plain-string shape as a fallback (e.g. "Standard
 * Headhunting", "Limited Headhunting - Festival"), in case any
 * operator entries still use that older format. */
function parseHowToObtain(raw: string | HowToObtainInfo | null | undefined): string[] {
  if (!raw) return [];

  if (typeof raw === 'string') {
    const methods: string[] = [];
    if (raw.includes('Standard Headhunting')) methods.push('Standard Headhunting');
    if (raw.includes('Kernel Headhunting')) methods.push('Kernel Headhunting');
    if (raw.includes('Limited Headhunting')) methods.push('Limited Headhunting');
    if (raw.includes('Recruitment')) methods.push('Recruitment');
    if (methods.length === 0) return [raw];
    return methods;
  }

  if (typeof raw !== 'object') return [];
  const methods: string[] = [];
  if (raw['Limited'] === 'Yes') methods.push('Limited Headhunting');
  if (raw['Standard Headhunting'] === 'Yes') methods.push('Standard Headhunting');
  if (raw['Kernel Headhunting'] === 'Yes') methods.push('Kernel Headhunting');
  if (raw['Recruitment'] === 'Yes') methods.push('Recruitment');
  const welfare = getWelfareInfo(raw);
  if (welfare) methods.push(`Welfare (${welfare['Unlock Type']})`);
  // 'Shop Operator' intentionally excluded, even when "Yes".
  return methods;
}

/** Builds every enabled hint. If a selected category has no data for
 * this operator (no listed Japanese CV, no talent, no module data, no
 * released skin, etc.), that itself becomes a hint -- "Not available
 * (might be a hint!)" -- rather than the category being silently
 * skipped, since the absence of something can narrow down who it is
 * too. */
export function buildHintPool(operator: GuesserOperator, enabledTypes: Set<HintType>, skins: GuesserSkin[] = []): Hint[] {
  const hints: Hint[] = [];
  const has = (t: HintType) => enabledTypes.has(t);
  const redact = (text: string) => redactOperatorName(text, operator.name);

  if (has('skillDescription')) {
    // M3 specifically, per your request -- one hint per skill that has
    // an M3-tier description, matching skillIcon's per-skill pattern
    // so a 6-star's 3 skills contribute 3 hints here too, not just 1.
    const allSkills = getSkillList(operator).filter((s) => s.name);
    const m3Descriptions = allSkills
      .map((skill) => skill.levels?.find((lv) => lv.mastery === 3)?.description)
      .filter((d): d is string => !!d);
    if (m3Descriptions.length === 0) {
      hints.push({ type: 'skillDescription', label: 'Skill Description', value: NOT_AVAILABLE });
    } else {
      m3Descriptions.forEach((description) => {
        hints.push({ type: 'skillDescription', label: 'Skill Description', value: redact(description) });
      });
    }
  }

  if (has('skillIcon')) {
    const allSkills = getSkillList(operator).filter((s) => s.name);
    if (allSkills.length === 0) {
      hints.push({ type: 'skillIcon', label: 'Skill Icon', value: NOT_AVAILABLE });
    } else {
      allSkills.forEach((skill, i) => {
        const iconPath = skill.icon || getSkillIconPath(operator.name, skill.name);
        hints.push({
          type: 'skillIcon',
          label: 'Skill Icon',
          value: iconPath || NOT_AVAILABLE,
          isImage: !!iconPath,
        });
      });
    }
  }
  if (has('baseSkillName')) {
    // Base means the RIIC facility system, not the operator's first combat skill.
    const names = [...new Set((operator.baseSkills || []).map((skill) => skill.name?.trim()).filter((name): name is string => Boolean(name)))];
    for (const name of names.length ? names : [NOT_AVAILABLE]) {
      hints.push({ type: 'baseSkillName', label: 'Base Skill Name', value: name === NOT_AVAILABLE ? name : redact(name) });
    }
  }
  if (has('tags')) {
    hints.push({ type: 'tags', label: 'Tags', value: operator.tags?.length > 0 ? operator.tags.join(', ') : NOT_AVAILABLE });
  }
  if (has('talentName')) {
    const namedTalents = (operator.talents || []).filter((t) => t.name);
    if (namedTalents.length === 0) {
      hints.push({ type: 'talentName', label: 'Talent Name', value: NOT_AVAILABLE });
    } else {
      namedTalents.forEach((talent, i) => {
        hints.push({
          type: 'talentName',
          label: 'Talent Name',
          value: redact(talent.name as string),
        });
      });
    }
  }
  if (has('talentDescription')) {
    // Same de-duplication concern as talentName -- every talent here
    // has already been normalized upstream (see normalizeTalents() in
    // lib/operators/operators.ts) so a single talent that only scales
    // with Potential is one entry with multiple rows, not six separate
    // "talents." Always use the LAST row -- the highest Potential
    // level -- as the description shown, matching the same
    // highest-first convention already used for talents in
    // techniques.tsx and synergies.tsx.
    const talentsWithRows = (operator.talents || []).filter((t) => t.rows && t.rows.length > 0);
    let pushedAny = false;
    talentsWithRows.forEach((talent) => {
      const highestPotentialRow = talent.rows[talent.rows.length - 1];
      if (highestPotentialRow?.description) {
        hints.push({
          type: 'talentDescription',
          label: 'Talent Description',
          value: redact(highestPotentialRow.description),
        });
        pushedAny = true;
      }
    });
    if (!pushedAny) {
      hints.push({ type: 'talentDescription', label: 'Talent Description', value: NOT_AVAILABLE });
    }
  }
  if (has('releaseDate')) {
    hints.push({ type: 'releaseDate', label: 'Global Release Date', value: operator.characterInfo?.['Release Date'] || NOT_AVAILABLE });
  }
  if (has('operatorRecord')) {
    // Best-effort field name -- matches the characterInfo['Release
    // Date'] pattern above, since I don't have operatorTypes.ts to
    // confirm the actual key used for this field. Redacted since an
    // Operator Record's text commonly refers to the operator by name.
    const record = operator.characterInfo?.['Operator Record'];
    hints.push({ type: 'operatorRecord', label: 'Operator Record', value: record ? redact(record) : NOT_AVAILABLE });
  }
  if (has('paradoxSimulation')) {
    // Same caveat as operatorRecord -- best-effort field name. Redacted
    // since Paradox Simulation titles are usually literally the
    // operator's own name (e.g. "SilverAsh's Doubt").
    const paradox = operator.characterInfo?.['Paradox Simulation'];
    hints.push({ type: 'paradoxSimulation', label: 'Paradox Simulation', value: paradox ? redact(paradox) : NOT_AVAILABLE });
  }
  if (has('rarity')) {
    hints.push({ type: 'rarity', label: 'Rarity', value: operator.rarity ? `${operator.rarity}★` : NOT_AVAILABLE });
  }
  if (has('class')) {
    hints.push({ type: 'class', label: 'Class', value: operator.class || NOT_AVAILABLE });
  }
  if (has('faction')) {
    hints.push({ type: 'faction', label: 'Faction', value: operator.faction || NOT_AVAILABLE });
  }
  if (has('jpVA')) {
    hints.push({ type: 'jpVA', label: 'Japanese VA', value: operator.characterVoices?.['Japanese'] || NOT_AVAILABLE });
  }
  if (has('enVA')) {
    hints.push({ type: 'enVA', label: 'English VA', value: operator.characterVoices?.['English'] || NOT_AVAILABLE });
  }
  if (has('cnVA')) {
    const voices = operator.characterVoices || {};
    const chinese = voices.Chinese || Object.entries(voices).find(([language, voice]) => language.startsWith('Mandarin') && voice)?.[1];
    hints.push({ type: 'cnVA', label: 'Chinese VA', value: chinese || NOT_AVAILABLE });
  }
  if (has('krVA')) {
    hints.push({ type: 'krVA', label: 'Korean VA', value: operator.characterVoices?.Korean || NOT_AVAILABLE });
  }
  if (has('dateOfBirth')) {
    hints.push({ type: 'dateOfBirth', label: 'Date of Birth', value: operator.basicInfo?.['Date of Birth'] || NOT_AVAILABLE });
  }
  if (has('height')) {
    hints.push({ type: 'height', label: 'Height', value: operator.basicInfo?.['Height'] || NOT_AVAILABLE });
  }
  if (has('infectionStatus')) {
    // Unlike every other category, absence here isn't itself surfaced
    // as a hint -- not every operator has this field at all (e.g.
    // non-humanoid operators), so "Not available" wouldn't be a
    // meaningful signal the way it is elsewhere. Only pushed when a
    // real value exists.
    const infectionStatus = operator.basicInfo?.['Infection Status'];
    if (infectionStatus) {
      hints.push({ type: 'infectionStatus', label: 'Infection Status', value: infectionStatus });
    }
  }
  if (has('howToObtain')) {
    const methods = parseHowToObtain(operator.howToObtain);
    hints.push({
      type: 'howToObtain',
      label: 'How to Obtain',
      value: methods.length > 0 ? redact(methods.join(', ')) : NOT_AVAILABLE,
    });
  }
  if (has('branch')) {
    hints.push({ type: 'branch', label: 'Branch', value: operator.branch || NOT_AVAILABLE });
  }
  if (has('letterCount')) {
    // Always available -- derived directly from the operator's own
    // name, so there's no "missing data" case here.
    const blanked = operator.name
      .split('')
      .map((c) => (/[a-zA-Z]/.test(c) ? '_' : c))
      .join(' ');
    const letterTotal = operator.name.split('').filter((c) => /[a-zA-Z]/.test(c)).length;
    hints.push({ type: 'letterCount', label: 'Number of Letters', value: `${blanked} (${letterTotal})` });
  }
  if (has('placeOfBirth')) {
    hints.push({ type: 'placeOfBirth', label: 'Place of Birth', value: operator.basicInfo?.['Place of Birth'] || NOT_AVAILABLE });
  }
  if (has('race')) {
    hints.push({ type: 'race', label: 'Race', value: operator.basicInfo?.['Race'] || NOT_AVAILABLE });
  }
  if (has('ep')) {
    const epValue = typeof operator.ep === 'string' ? operator.ep : operator.ep?.['Main'];
    hints.push({ type: 'ep', label: 'EP', value: epValue || NOT_AVAILABLE });
  }

  const operatorSkins = skins.filter((s) => s.model === operator.name);
  if (has('skinName')) {
    if (operatorSkins.length === 0) {
      hints.push({ type: 'skinName', label: 'Skin Name', value: NOT_AVAILABLE });
    } else {
      operatorSkins.forEach((skin, i) => {
        hints.push({
          type: 'skinName',
          label: 'Skin Name',
          value: redact(skin.name),
        });
      });
    }
  }
  if (has('illustrator')) {
    const skinWithIllustrator = shuffle(operatorSkins).find((s) => s.illustrator);
    hints.push({ type: 'illustrator', label: 'Illustrator', value: skinWithIllustrator?.illustrator || NOT_AVAILABLE });
  }

  return shuffle(hints);
}

export function pickRandomOperator(operators: GuesserOperator[]): GuesserOperator {
  return operators[Math.floor(Math.random() * operators.length)];
}
