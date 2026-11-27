import type { EnemyDefenseForm } from './enemyDefenseForms';
import type { Target } from './calculator';

type Defenses = Pick<Target, 'def' | 'res'>;
export interface EnemyFightPhase extends Defenses {
  name: string;
  ends?: { hpRatio: number } | { duration: number };
  restore?: number;
  invulnerable?: boolean;
}

function revivalFight(
  first: EnemyFightPhase, second: EnemyFightPhase, revival: number, protection: number, restore: number,
): EnemyFightPhase[] {
  const phases: EnemyFightPhase[] = [
    { ...first, ends: { hpRatio: 0 } },
    { ...first, name: 'Revival', invulnerable: true, ends: { duration: revival } },
  ];
  if (protection > 0) {
    phases.push({ ...second, restore, invulnerable: true, ends: { duration: protection } }, second);
  } else {
    phases.push({ ...second, restore });
  }
  return phases;
}

// Keys and modifiers come from the pinned enemy blackboard. A matching key
// alone does not establish when a boss changes form or how much HP it restores.
const thresholdKeys: Record<string, string> = {
  enemy_1503_talula: 'halfhp.hp_ratio',
  enemy_1559_vtlionk: 'advance.hp_ratio',
  enemy_9032_aclionk: 'advance.hp_ratio',
  enemy_1232_dssalr: 'Buff.hp_ratio',
  enemy_1232_dssalr_2: 'Buff.hp_ratio',
  enemy_1232_dssalr_4: 'Buff.hp_ratio',
  enemy_2020_cswrtr: 'rage.hp_ratio',
};

const revivals: Record<string, { duration: string; protection?: string; restore?: string }> = {
  enemy_1505_frstar: { duration: 'reborn.duration' },
  enemy_1506_patrt: { duration: 'reborn.duration', protection: 'reborn.patrt_t_state_2[reborn_invincible].duration' },
  enemy_1510_frstar2: { duration: 'reborn.duration', protection: 'reborn.reborn_invincible.duration' },
  enemy_1523_mandra: { duration: 'Reborn.duration', protection: 'Reborn.mandra_p2_invinsible.duration' },
  enemy_1528_manfri: { duration: 'Reborn.duration', protection: 'Reborn.invincible' },
  enemy_1533_stmkgt: { duration: 'reborn.duration', protection: 'reborn.stmkgt_t_state_2[reborn_invincible].duration' },
  enemy_1543_cstlrs: { duration: 'Reborn.duration', protection: 'Reborn.invincible', restore: 'Reborn.hp_ratio' },
  enemy_2038_sydonq: { duration: 'Reborn.duration', restore: 'Reborn.hp_ratio' },
};

export function enemyFightPhases(
  id: string, base: Defenses, forms: EnemyDefenseForm[] | undefined, talents: ReadonlyMap<string, number>,
): EnemyFightPhase[] | undefined {
  const thresholdKey = thresholdKeys[id];
  if (thresholdKey && forms?.length === 2) {
    const hpRatio = talents.get(thresholdKey);
    if (hpRatio !== undefined && hpRatio > 0 && hpRatio < 1) {
      return [{ ...forms[0], ends: { hpRatio } }, forms[1]];
    }
  }
  const revival = revivals[id];
  if (revival) {
    const duration = talents.get(revival.duration);
    const protection = revival.protection ? talents.get(revival.protection) : 0;
    const restore = revival.restore ? talents.get(revival.restore) : 1;
    if (duration === undefined || duration <= 0 || protection === undefined || protection < 0
      || restore === undefined || restore <= 0 || restore > 1) return;
    if (forms?.length === 2) return revivalFight(forms[0], forms[1], duration, protection, restore);
    return revivalFight({ ...base, name: 'First form' }, { ...base, name: 'Second form' }, duration, protection, restore);
  }

  if (id === 'enemy_1172_dugago' || id === 'enemy_1172_dugago_2') {
    const ground = forms?.find(form => form.id === 'ground');
    const statue = forms?.find(form => form.id === 'statue');
    const flying = forms?.find(form => form.id === 'flying');
    const duration = talents.get('stone.duration');
    if (ground && statue && flying && duration !== undefined && duration > 0) {
      return [{ ...ground, ends: { hpRatio: 0 } }, { ...statue, restore: 1, ends: { duration } }, flying];
    }
  }
}
