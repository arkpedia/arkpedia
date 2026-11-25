import { calculate, initialTarget, type Build, type DamageType, type Target } from './calculator';

const hpAxes = [
  ['def', 'Physical'],
  ['res', 'Arts'],
  ['elementalRes', 'Elemental'],
] as const satisfies readonly [keyof Target, DamageType][];

export type DefenseAxis = (typeof hpAxes)[number][0] | 'injuryRes';
export type ChartMetric = 'dps' | 'damage' | 'injuryRate' | 'injury' | 'seconds' | 'repeat';

const unmitigated = { def: 0, res: 0, elementalRes: 0, injuryRes: 0 } as const;
const opening = 'None';
type Result = ReturnType<typeof calculate>;
const hasInjury = (result: Result) => result.injury > 0 || result.periodic > 0;

export function targetControls(builds: Build[]) {
  const neutral = { ...initialTarget, ...unmitigated, burst: opening };
  const defenses = new Set<DefenseAxis>();
  const bursts = new Set<string>();
  for (const build of builds) {
    const normal = calculate(build, neutral);
    const burst = normal.element ? calculate(build, { ...neutral, burst: normal.element }) : normal;
    const buildup = hasInjury(normal) || (normal.summon?.injury ?? 0) > 0
      || normal.effects.some(effect => effect.type === 'Injury');
    for (const [axis, component] of hpAxes) {
      if (normal.components[component] > 0 || burst.components[component] > 0) defenses.add(axis);
    }
    if (buildup) defenses.add('injuryRes');
    if (buildup || normal.effects.some(effect => effect.type === 'Elemental')) defenses.add('elementalRes');
    if (normal.element && (buildup || burst.interval !== normal.interval
      || Object.keys(normal.components).some(type => burst.components[type as DamageType] !== normal.components[type as DamageType]))) {
      bursts.add(normal.element);
    }
  }
  return { defenses, bursts: [...bursts], buildup: defenses.has('injuryRes') };
}

export function chartControls(builds: Build[], target: Target, preferred?: ChartMetric) {
  const neutral = { ...target, ...unmitigated };
  const current = builds.map(build => calculate(build, neutral));
  const firstContact = target.burst === opening ? current : builds.map(build => calculate(build, { ...neutral, burst: opening }));
  const burstTimeline = firstContact.some(result => result.injury > 0);
  const damage = current.some(result => result.damage > 0);
  const rate = current.some(result => (result.dps ?? 0) > 0);
  const injury = current.some(result => result.injury > 0);
  const injuryRate = current.some(result => (result.injuryRate ?? 0) > 0);
  const metrics: ChartMetric[] = [];
  if (rate) metrics.push('dps');
  if (damage) metrics.push('damage');
  if (injuryRate) metrics.push('injuryRate');
  if (injury) metrics.push('injury');
  if (burstTimeline) metrics.push('seconds', 'repeat');
  // Utility skills can have a meaningful zero-damage result at the selected target.
  if (!metrics.length) metrics.push('damage');
  const singleAction = current.some(result => result.damage > 0 && result.interval === null);
  const defaultMetric = damage
    ? singleAction || !rate ? 'damage' : 'dps'
    : burstTimeline && (injuryRate || !injury) ? 'seconds' : injury ? 'injury' : metrics[0];
  const metric = preferred && metrics.includes(preferred) ? preferred : defaultMetric;

  let axes: DefenseAxis[];
  if (metric === 'damage' || metric === 'dps') {
    axes = hpAxes.map(([axis, component]) => ({
      axis,
      amount: current.reduce((sum, result) => sum + (metric === 'damage'
        ? result.components[component]
        : result.interval ? result.components[component] / result.interval : 0), 0),
    })).filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount).map(row => row.axis);
  } else {
    const timing = metric === 'seconds' || metric === 'repeat';
    const scenario = timing ? { ...neutral, burst: opening } : neutral;
    const results = timing ? firstContact : current;
    const measure = timing ? 'injury' : metric;
    const sample = { def: 3000, res: 100, elementalRes: 100 };
    axes = ['injuryRes', ...hpAxes.flatMap(([axis]) => builds.some((build, index) => {
      const modified = calculate(build, { ...scenario, [axis]: sample[axis] });
      return Math.abs((modified[measure] ?? 0) - (results[index][measure] ?? 0)) > 1e-8;
    }) ? [axis] : [])];
  }
  return { metrics, defaultMetric, metric, axes, burstTimeline };
}
