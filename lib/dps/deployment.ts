import { calculate, mitigate, normalize, profile, type Build, type Target } from './calculator';

export function deploymentSequence(
  silver: Build,
  ally: Build,
  target: Target,
  stacks: number,
  delay: number,
  firstPhantomAttack: number | null = null,
  impactAtk: number | null = null,
) {
  const b = normalize(ally),
    owner = normalize(silver);
  if (owner.operator !== 'svash2' || owner.skill !== 2 || b.operator === owner.operator) return [];
  const rank = profile(owner).skills.find((x) => x.slot === 2)!.ranks[owner.rank - 1];
  const allySkill = profile(b).skills.find((x) => x.slot === b.skill);
  const allyRank = allySkill?.ranks[b.rank - 1];
  const bloodyOpus = b.operator === 'phatom' && b.skill === 2;
  const nightRaid = b.operator === 'phatom' && b.skill === 3;
  const onDeploy = (b.operator === 'skadi' && b.skill === 2) || bloodyOpus || nightRaid;
  const token = profile(owner)
    .talents[0]?.filter((t) => t.elite <= owner.elite && t.potential <= owner.potential)
    .at(-1);
  const readyAt =
    allySkill?.manual && allyRank
      ? Math.max(0, allyRank.sp - allyRank.initialSp - (token?.values.sp ?? 0))
      : 0;
  const activeAt = allySkill?.manual ? Math.max(readyAt, delay) : onDeploy ? 0 : Infinity;
  const normal = calculate({ ...b, skill: 0 }, target);
  const before = normal.atk,
    active = calculate(b, target).atk;
  const events = [{ time: 0, label: 'Ally deployed', atk: before, damage: 0 }];
  if (allyRank && Number.isFinite(activeAt)) {
    const hit = nightRaid ? mitigate(active * allyRank.atk_scale, 'Physical', target) : 0;
    events.push({
      time: activeAt,
      label: nightRaid
        ? 'Night Raid hit'
        : bloodyOpus
          ? 'Bloody Opus · ' + allyRank.times + ' charges'
          : 'Ally skill active',
      atk: active,
      damage: hit,
    });
  }
  for (let n = 0; n < Math.min(stacks, rank.max_stack_cnt); n++) {
    const time = 1 + n * 0.4;
    let atk = time >= activeAt ? active : before;
    if (
      bloodyOpus &&
      allyRank &&
      normal.interval &&
      firstPhantomAttack !== null &&
      time >= firstPhantomAttack
    ) {
      const attacks = 1 + Math.floor((time - firstPhantomAttack) / normal.interval + 1e-9);
      atk = before + normal.base * allyRank.atk * Math.max(0, allyRank.times - attacks);
    }
    atk = impactAtk ?? atk;
    events.push({
      time,
      label: 'Stored S2 strike ' + (n + 1),
      atk,
      damage: mitigate(atk * rank.atk_scale, 'Physical', target),
    });
  }
  return events.sort((a, z) => a.time - z.time);
}
