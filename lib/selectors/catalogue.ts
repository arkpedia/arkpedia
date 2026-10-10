import { getAllOperators } from '@/lib/operators/operators';
import { getSkillList, type Operator } from '@/lib/operators/operatorTypes';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { operatorHref } from '@/lib/operators/operatorHref';
import { announcedRewards } from '@/lib/events/announcements';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { rewardIconPath } from '@/lib/events/rewardIcons';
import { FINAL_STATS_ROWS } from '@/lib/results/finalPollResults';
import ratingsData from '@/config/selector-ratings.json';
import packArt from '@/config/event-pack-art.json';
import type { ResolvedTicket } from '@/components/events/RewardDetails';
import type { SelectorCandidate } from './scoring';

const EVENT = '[Celebration] Critical Phase Transition';
const CURRENT = [
  { name: 'Special Event Transfer Permit', label: 'Gifted 6★ selector', pack: null },
  { name: '2026 Celebration Operator Permit', label: 'Purchasable 6★ selector', pack: 'Rhodes Island Headhunting Pack' },
  { name: 'Top Operator Transfer Permit - Kernel', label: 'Purchasable Kernel 6★ selector', pack: 'Rhodes Island Headhunting Pack - Kernel' },
];
/** Scan direct damage descriptions, not mentions of damage taken or allies' buffs.
 * Includes attacks by summons (e.g. Mon3tr), conversion skills and retaliatory damage. */
export function damageTypes(op: Operator) {
  const traits = typeof op.trait === 'string' ? [op.trait] : Object.values(op.trait ?? {});
  const texts = [...traits, ...getSkillList(op).flatMap(s => s.levels.map(l => l.description ?? '')),
    ...(op.talents ?? []).flatMap(t => t.rows.map(r => r.description ?? ''))];
  const deals = (type: string) => texts.some(t => typeof t === 'string' && new RegExp(`(?:deal\\w*|inflict\\w*|attacks?|convert\\w*)[^.;\\n]{0,180}\\b${type} damage\\b`, 'i').test(t));
  return { arts: deals('Arts'), trueDamage: deals('True') };
}
export function buildSelectorCatalogue() {
  const roster = getAllOperators();
  const ratings = ratingsData.ratings as Record<string, number>;
  const community = new Map(FINAL_STATS_ROWS.filter(row => row.n > 0).map(row => [row.operator_name, row.mean]));
  const candidates: SelectorCandidate[] = roster.filter(op => op.rarity === 6).map(op => {
    const skills = getSkillList(op);
    // Count each skill once; a main M3 and a sub breakpoint on the same skill are one main skill.
    const priorities = skills.map(s => s.recommendation?.some(r => r.priority === 'main') ? 'main'
      : s.recommendation?.some(r => r.priority === 'sub') ? 'sub' : null);
    return { name: op.name, id: op.internalName ?? op.name, caster: op.class === 'Caster', ...damageTypes(op),
      kukkikaze: ratings[op.internalName ?? ''] ?? null, community: community.get(op.name) ?? null,
      mainSkills: priorities.filter(p => p === 'main').length, subSkills: priorities.filter(p => p === 'sub').length,
      isModule: (op.modules ?? []).some(m => /^ISW[- ]/.test(m.name ?? '')),
      raModule: (op.modules ?? []).some(m => /^RA[- ]/.test(m.name ?? '')) };
  });
  const announced = announcedRewards(EVENT, []).tickets;
  const tickets: Record<string, ResolvedTicket> = {};
  const cards = CURRENT.map(card => {
    const ticket = announced[card.name];
    if (!ticket) throw new Error(`Missing current selector: ${card.name}`);
    tickets[card.name] = { ...ticket, operators: ticket.operators.map(name => {
      const op = roster.find(o => o.name === name && o.rarity === 6);
      if (!op) throw new Error(`Unknown selector operator: ${name}`);
      return { name, iconPath: getOperatorIconPath(op), href: operatorHref(name, null) };
    }) };
    const imagePath = card.pack ? (packArt as Record<string, string>)[card.pack] : rewardIconPath({ name: card.name, type: 'material', id: null }, () => null, publicFileExists);
    return { ...card, imagePath: imagePath ?? null };
  });
  return { tickets, cards, candidates };
}
