import type { CombatStats, Contract, RuneEffect } from './types';

const ATTRS: Record<string, string> = { max_hp: 'hp', atk: 'atk', def: 'def', magic_resistance: 'res', move_speed: 'moveSpeed', attack_speed: 'aspd', base_attack_time: 'interval', respawn_time: 'redeploy', cost: 'dp' };
export const STAT_LABELS: Record<string, string> = { hp: 'HP', atk: 'ATK', def: 'DEF', res: 'RES', dp: 'DP cost', block: 'Block count', interval: 'Attack interval (s)', redeploy: 'Redeploy time (s)', moveSpeed: 'Movement speed', weight: 'Weight', aspd: 'Attack speed', physicalTaken: 'Physical damage taken (%)', artsTaken: 'Arts damage taken (%)' };
const CLASSES: Record<string, number> = { Guard: 1, Sniper: 2, Defender: 4, Medic: 8, Supporter: 16, Caster: 32, Specialist: 64, Vanguard: 512 };
export interface Subject { side: 'operator' | 'enemy'; id?: string; className?: string | null; tile?: 'ground' | 'high'; elapsed?: number }
export const board = (effect: RuneEffect) => Object.fromEntries(effect.blackboard.map(row => [row.key, row.valueStr ?? row.value]));
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const signed = (value: number, percent = false) => `${value > 0 ? '+' : ''}${Math.round(value * (percent ? 100 : 1) * 1000) / 1000}${percent ? '%' : ''}`;

export function toggleContract(selected: string[], contract: Contract, all: Contract[]): string[] {
  if (selected.includes(contract.id)) return selected.filter(id => id !== contract.id);
  // Only the node's exclusion group is exclusive. A packed rune's mutex key is
  // NOT: CCB explicitly allows additive tiers from the same family together.
  const incompatible = new Set(all.filter(row => row.runeId === contract.runeId || contract.exclusion && row.exclusion === contract.exclusion).map(row => row.id));
  return [...selected.filter(id => !incompatible.has(id)), contract.id];
}

export function maximumContractScore(contracts: Contract[]): number {
  const exclusive = new Map<string, number>();
  let total = 0;
  for (const contract of contracts) {
    if (contract.exclusion) exclusive.set(contract.exclusion, Math.max(exclusive.get(contract.exclusion) ?? 0, contract.score));
    else total += contract.score;
  }
  return total + [...exclusive.values()].reduce((sum, score) => sum + score, 0);
}

export function replacementId(id: string, contracts: Contract[]): string {
  const seen = new Set<string>();
  while (!seen.has(id)) {
    seen.add(id);
    const effect = contracts.flatMap(contract => contract.effects).find(effect => effect.key === 'level_enemy_replace' && board(effect).key === id);
    if (!effect) break;
    id = String(board(effect).value);
  }
  return id;
}

function enemyIds(effect: RuneEffect): string[] {
  const bb = board(effect);
  const filter = effect.selector.enemyIdFilter;
  return typeof bb.enemy === 'string' ? bb.enemy.split('|') : Array.isArray(filter) ? filter : [];
}

export function applies(effect: RuneEffect, subject: Subject): boolean {
  const bb = board(effect);
  const enemy = effect.key.startsWith('enemy_') || String(bb.key).includes('enemy_damage_scale');
  const ally = effect.key.startsWith('char_') || String(bb.key).includes('all_ally');
  if (subject.side === 'enemy' && !enemy || subject.side === 'operator' && !ally) return false;
  const ids = enemyIds(effect);
  if (ids.length && (!subject.id || !ids.includes(subject.id))) return false;
  const excluded = effect.selector.enemyIdExcludeFilter;
  if (Array.isArray(excluded) && subject.id && excluded.includes(subject.id)) return false;
  const mask = effect.selector.professionMask;
  if (subject.side === 'operator' && mask && mask !== 1023 && !(mask & (CLASSES[subject.className ?? ''] ?? 0))) return false;
  const height = effect.selector.heightTypeMask;
  if (height && !(height & (subject.tile === 'high' ? 2 : 1))) return false;
  if (typeof bb.duration === 'number' && (subject.elapsed ?? 0) >= bb.duration) return false;
  return true;
}

/** Sheet stats only. Skills, talents, damage events and tile mechanics stay in
 * the modifier list. They are never silently substituted for HP/ATK/DEF. */
export function modifiedStats(base: CombatStats, contracts: Contract[], subject: Subject): CombatStats {
  const flat: Record<string, number> = {}, additive: Record<string, number> = {}, multiplicative: Record<string, number> = {}, caps: Record<string, number> = {};
  const add = (target: Record<string, number>, key: string, value: number) => { target[key] = (target[key] ?? 0) + value; };
  const mul = (key: string, value: number) => { multiplicative[key] = (multiplicative[key] ?? 1) * value; };
  for (const contract of contracts) for (const effect of contract.effects) {
    if (!applies(effect, subject)) continue;
    const bb = board(effect), key = effect.key;
    if (/^(enemy|char)_attribute_(additive_mul|mul|add)$/.test(key)) {
      for (const [attr, value] of Object.entries(bb)) {
        const stat = ATTRS[attr], n = number(value);
        if (!stat || n === undefined) continue;
        if (key.endsWith('_additive_mul')) add(additive, stat, n);
        else if (key.endsWith('_mul')) mul(stat, n);
        else add(flat, stat, n);
      }
    } else if (key.startsWith('env_gbuff') && String(bb.key).startsWith('attr_common_global_buff[all_ally]')) {
      for (const [attr, stat] of Object.entries(ATTRS)) {
        const n = number(bb[attr]);
        if (n !== undefined) add(attr === 'attack_speed' ? flat : additive, stat, n);
      }
    } else if (key.startsWith('env_gbuff') && String(bb.key).startsWith('enemy_damage_scale')) {
      const stat = String(bb.key).includes('[phy]') ? 'physicalTaken' : 'artsTaken';
      add(additive, stat, Number(bb.damage_scale ?? 0));
    } else if (key === 'char_respawntime_mul') mul('redeploy', Number(bb.scale));
    else if (key === 'char_cost_mul') mul('dp', Number(bb.scale));
    else if (key === 'char_cost_add') add(flat, 'dp', Number(bb.value));
    else if (key === 'char_blockcnt_add') add(flat, 'block', Number(bb.value));
    else if (key === 'char_blockcnt_max') caps.block = Math.min(caps.block ?? Infinity, Number(bb.value));
    else if (key === 'enemy_weight_add') add(flat, 'weight', Number(bb.value));
  }
  const result: CombatStats = { ...base };
  for (const [key, value] of Object.entries(base)) {
    if (value === null) continue;
    const v = ((value + (flat[key] ?? 0)) * Math.max(0, 1 + (additive[key] ?? 0))) * (multiplicative[key] ?? 1);
    result[key] = Math.max(0, Math.min(caps[key] ?? Infinity, v));
  }
  if (base.interval != null && base.aspd != null && result.aspd != null) {
    result.aspd = Math.min(600, Math.max(10, result.aspd));
    result.interval = (result.interval ?? base.interval) * base.aspd / result.aspd;
  }
  return result;
}

export function resolvedDescription(contract: Contract): string {
  const values = Object.assign({}, ...contract.effects.map(board));
  return contract.description.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (raw, key: string, format: string) => {
    const stored = values[key.startsWith('-') ? key.slice(1) : key];
    const v = typeof stored === 'number' && key.startsWith('-') ? -stored : stored;
    return typeof v === 'number' ? format?.includes('%') ? `${Math.round(v * 100)}%` : String(v) : typeof v === 'string' ? v : raw;
  });
}

export function effectSummary(effect: RuneEffect, names: Record<string, string> = {}): string | null {
  const bb = board(effect), key = effect.key;
  const ids = enemyIds(effect);
  const classes = Object.entries(CLASSES).filter(([, bit]) => bit & (effect.selector.professionMask ?? 1023)).map(([name]) => name);
  const target = key.startsWith('enemy_') || String(bb.key).includes('enemy_damage_scale')
    ? ids.length ? [...new Set(ids.map(id => names[id] ?? id))].join(' / ') : 'All enemies'
    : classes.length === 8 ? 'All operators' : classes.join(' / ');
  const tile = effect.selector.heightTypeMask === 1 ? ' on ground tiles' : effect.selector.heightTypeMask === 2 ? ' on high tiles' : '';
  const duration = typeof bb.duration === 'number' ? ` for ${bb.duration}s after deployment` : '';
  if (/^(enemy|char)_attribute_(additive_mul|mul|add)$/.test(key) || key.startsWith('env_gbuff') && String(bb.key).startsWith('attr_common_global_buff[all_ally]')) {
    const percent = key.endsWith('additive_mul') || key.startsWith('env_gbuff');
    const stats = Object.entries(bb).flatMap(([attr, value]) => {
      if (!ATTRS[attr] || typeof value !== 'number') return [];
      const label = STAT_LABELS[ATTRS[attr]];
      return [`${label} ${key.endsWith('_mul') && !key.endsWith('additive_mul') ? `×${value}` : signed(value, percent && attr !== 'attack_speed')}`];
    });
    return stats.length ? `${target}${tile}: ${stats.join(', ')}${duration}` : null;
  }
  if (String(bb.key).startsWith('enemy_damage_scale')) return `${target}: ${String(bb.key).includes('[phy]') ? 'physical' : 'Arts'} damage taken ${signed(Number(bb.damage_scale), true)}`;
  if (key === 'char_respawntime_mul') return `${target}: redeploy time ×${bb.scale}`;
  if (key === 'char_cost_mul') return `${target}: DP cost ×${bb.scale}`;
  if (key === 'char_cost_add') return `${target}: DP cost ${signed(Number(bb.value))}`;
  if (key === 'char_blockcnt_add') return `${target}: block count ${signed(Number(bb.value))}`;
  if (key === 'char_blockcnt_max') return `${target}: block count capped at ${bb.value}`;
  if (key === 'enemy_weight_add') return `${target}: weight ${signed(Number(bb.value))}`;
  if (key === 'global_lifepoint') return `Life points: ${bb.value}`;
  if (key === 'global_squad_num_limit') return `Squad size: at most ${bb.value}`;
  if (key === 'global_placable_char_num_add') return `Deployment limit ${signed(Number(bb.value))}`;
  if (key === 'global_initial_cost_add') return `Initial DP ${signed(Number(bb.value))}`;
  if (key === 'global_cost_recovery_mul') return `Natural DP recovery ×${Math.round(1000 / Number(bb.scale)) / 1000}`;
  if (bb.key === 'character_extra_cost') return `On deployment: lose up to ${bb.cost} additional DP`;
  if (key === 'level_enemy_replace') return `Replace ${names[String(bb.key)] ?? bb.key} with ${names[String(bb.value)] ?? bb.value}`;
  if (key === 'enemy_dynamic_ability_new') return `${target}: ${String(bb.key).replace('stunimmue', 'stun immunity').replace('silenceimmue', 'silence immunity').replace('frozenimmue', 'Freeze immunity').replace('invisible', 'Invisible')}`;
  if (key === 'enemy_abnormal_immune') return `${target}: ${['sleeping', 'frozen', 'stun'].filter(attr => bb[attr]).map(attr => attr === 'sleeping' ? 'Sleep' : attr === 'frozen' ? 'Freeze' : 'Stun').join(' / ') || 'status'} immunity`;
  if (key === 'global_forbid_location' && typeof bb.location === 'string') return `${bb.location.split('|').length} map tiles become unavailable for deployment`;
  return null;
}

export function contractSummary(contract: Contract, names: Record<string, string> = {}): string {
  const summaries = contract.effects.map(effect => effectSummary(effect, names)).filter((s): s is string => !!s);
  return summaries.length === contract.effects.length ? summaries.join('; ') : resolvedDescription(contract);
}

/** The game's summary combines additive tiers; individual nodes stay selectable. */
export function activeModifierSummaries(contracts: Contract[], names: Record<string, string> = {}): { id: string; score: number; text: string; unmodeled: boolean }[] {
  const families = new Map<string, Contract[]>();
  for (const contract of contracts) families.set(contract.group, [...(families.get(contract.group) ?? []), contract]);
  return [...families.values()].flatMap(rows => {
    const first = rows[0], effect = first.effects[0];
    const bb = board(effect);
    const additive = /^(enemy|char)_attribute_(additive_mul|add)$/.test(effect.key)
      || effect.key.startsWith('env_gbuff') && /^(attr_common_global_buff\[all_ally\]|enemy_damage_scale)/.test(String(bb.key));
    const sameScope = rows.every(row => row.effects.length === 1 && row.effects[0].key === effect.key
      && JSON.stringify(row.effects[0].selector) === JSON.stringify(effect.selector)
      && Object.entries(board(row.effects[0])).every(([key, value]) => typeof value === 'number' && key !== 'duration' || bb[key] === value));
    if (rows.length > 1 && additive && sameScope) {
      const merged = { ...bb };
      for (const row of rows.slice(1)) for (const [key, value] of Object.entries(board(row.effects[0]))) {
        if (typeof value === 'number' && key !== 'duration') merged[key] = Number(merged[key] ?? 0) + value;
      }
      const combined: Contract = { ...first, effects: [{ ...effect, blackboard: Object.entries(merged).map(([key, value]) => typeof value === 'number' ? { key, value } : { key, valueStr: String(value) }) }] };
      return [{ id: first.group, score: rows.reduce((sum, row) => sum + row.score, 0), text: contractSummary(combined, names), unmodeled: false }];
    }
    return rows.map(row => ({ id: row.id, score: row.score, text: contractSummary(row, names), unmodeled: hasUnmodeledEffects(row) }));
  });
}

export function hasUnmodeledEffects(contract: Contract): boolean {
  return contract.effects.some(effect => !/^(enemy|char)_attribute_(additive_mul|mul|add)$/.test(effect.key)
    && !['char_respawntime_mul', 'char_cost_mul', 'char_cost_add', 'char_blockcnt_add', 'char_blockcnt_max', 'enemy_weight_add'].includes(effect.key)
    && !(effect.key.startsWith('env_gbuff') && /^(attr_common_global_buff\[all_ally\]|enemy_damage_scale)/.test(String(board(effect).key))));
}
