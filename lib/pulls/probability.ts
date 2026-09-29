/** Pure probability model; runs in a cancellable Web Worker, also exercised by Node tests. */
export interface OperatorTarget { name: string; copies: number }
export interface OddsOperator {
  name: string; rarity: 5 | 6; icon: string | null;
  share: number; // conditional probability within its rarity
  kind: 'featured' | 'returning'; spark?: number;
}
export interface BannerOdds {
  id: string; type: 'single' | 'limited' | 'crossover' | 'orienteering';
  operators: OddsOperator[]; bonus?: string; sources: string[];
  ordinarySix?: string[]; // inspectable projected pool, never an invented fixed denominator
}
export interface OddsRequest {
  rules: BannerOdds; pulls: number; targets: OperatorTarget[]; spark: boolean;
  roster?: string[];
}
export interface Chance { probability: number; certain: boolean; impossible: boolean }
export interface OddsResult { samples: number; copies: Chance[][]; all: Chance }
export const sixStarChance = (misses: number) => Math.min(1, .02 + Math.max(0, misses - 49) * .02);

/** Imported selections cannot inject rates, costs, or unavailable operators. */
export function selectedRules(request: OddsRequest): BannerOdds {
  const rules = request.rules;
  if (rules.type !== 'orienteering') return rules;
  const roster = new Set(request.roster || []);
  const selected = rules.operators.filter(op => roster.has(op.name));
  if (selected.filter(op => op.rarity === 6).length !== 3 || selected.filter(op => op.rarity === 5).length !== 3 || roster.size !== 6) throw new Error('Choose three 6★ and three 5★ rate-up operators first.');
  return { ...rules, operators: selected.map(op => ({ ...op, share: op.rarity === 6 ? 1 / 3 : .2 })) };
}
/** Is there a feasible allocation of ONE shared contract wallet to all deficits? */
export function canComplete(counts: readonly number[], targets: readonly OperatorTarget[], ops: readonly OddsOperator[], contracts: number): boolean {
  let cost = 0;
  for (let i = 0; i < targets.length; i++) {
    const missing = Math.max(0, targets[i].copies - counts[i]);
    if (missing && !ops[i].spark) return false;
    cost += missing * (ops[i].spark || 0);
  }
  return cost <= contracts;
}
function guaranteedCopies(rules: BannerOdds, op: OddsOperator, pulls: number): number {
  if (op.name === rules.bonus && pulls >= 300) return 1;
  if (op.kind === 'featured' && op.rarity === 6) {
    if (rules.type === 'crossover') return Math.floor(pulls / 120);
    if (rules.type === 'single' && pulls >= 249) return 1;
  }
  return 0;
}
function seededRandom(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function simulateOdds(request: OddsRequest, sampleOverride?: number, randomOverride?: () => number): OddsResult {
  const rules = selectedRules(request);
  const { pulls, targets } = request;
  if (!Number.isInteger(pulls) || pulls < 0 || pulls > 100000 || !targets.length || targets.length > 20 || new Set(targets.map(t => t.name)).size !== targets.length) throw new Error('Invalid probability request.');
  const ops = targets.map(target => {
    const op = rules.operators.find(o => o.name === target.name);
    if (!op || !Number.isInteger(target.copies) || target.copies < 1 || target.copies > 6) throw new Error('A selected goal is no longer available on this banner. Choose it again.');
    return op;
  });
  const contracts = request.spark && rules.type === 'limited' ? pulls : 0;
  const guaranteed = ops.map(op => guaranteedCopies(rules, op, pulls));
  const samples = sampleOverride ?? Math.min(50000, Math.max(2000, Math.floor(20000000 / Math.max(1, pulls))));
  if (!Number.isInteger(samples) || samples < 1) throw new Error('Invalid sample count.');
  // Stable across copy goals and spark toggles: compare the SAME simulated pulls.
  let seed = 1;
  for (const char of rules.id + JSON.stringify(request.roster || [])) seed = Math.imul(seed, 31) + char.charCodeAt(0) | 0;
  const random = randomOverride || seededRandom(seed);
  const hits = ops.map(() => Array<number>(6).fill(0));
  let allHits = 0;
  const six = rules.operators.filter(op => op.rarity === 6);
  const five = rules.operators.filter(op => op.rarity === 5);
  const pick = (pool: OddsOperator[]): string | undefined => {
    let roll = random();
    for (const op of pool) { roll -= op.share; if (roll < 0) return op.name; }
    return undefined; // an ordinary off-banner operator, still resets rarity pity
  };
  const index = new Map(ops.map((op, i) => [op.name, i]));
  const featuredSix = six.find(op => op.kind === 'featured')?.name;
  // A crossover's rate-up 5★, drawn by their shares when a guarantee names one of them.
  const featuredFives = five.filter(op => op.kind === 'featured');
  const featuredFiveShare = featuredFives.reduce((total, op) => total + op.share, 0);
  const pickFeaturedFive = (): string | undefined => {
    if (featuredFives.length < 2) return featuredFives[0]?.name; // no draw: one-5★ banners sample as before
    let roll = random() * featuredFiveShare;
    for (const op of featuredFives) { roll -= op.share; if (roll < 0) return op.name; }
    return featuredFives.at(-1)?.name;
  };
  for (let run = 0; run < samples; run++) {
    const counts = ops.map(() => 0);
    // fiveSeen: a rate-up 5★ has come. owedFive: the other rate-up 5★, which the next 5★ is
    // once the first of two has come (pairDone once it has been paid).
    let pity = 0, sinceFeatured = 0, usedSingleGuarantee = false, fiveSeen = false, firstTenDone = false;
    let owedFive: string | undefined, pairDone = false;
    for (let pull = 1; pull <= pulls; pull++) {
      const hardSix = rules.type === 'crossover' && sinceFeatured >= 119;
      const sixRate = sixStarChance(pity);
      const rarityRoll = random();
      let name: string | undefined;
      if (hardSix || rarityRoll < sixRate) {
        const singleGuarantee = rules.type === 'single' && !usedSingleGuarantee && sinceFeatured >= 150;
        name = hardSix || singleGuarantee ? featuredSix : pick(six);
        if (singleGuarantee) usedSingleGuarantee = true;
        pity = 0;
        firstTenDone = true;
      } else {
        pity++;
        if ((!firstTenDone && pull === 10) || rarityRoll < sixRate + (1 - sixRate) * (.08 / .98)) {
          if (rules.type !== 'crossover') name = pick(five);
          else if (owedFive) { name = owedFive; owedFive = undefined; pairDone = true; }
          else name = pull > 50 && !fiveSeen ? pickFeaturedFive() : pick(five);
          firstTenDone = true;
          if (rules.type === 'crossover' && featuredFives.some(op => op.name === name)) {
            if (!fiveSeen && !pairDone && featuredFives.length > 1) owedFive = featuredFives.find(op => op.name !== name)?.name;
            fiveSeen = true;
          }
        }
      }
      sinceFeatured = name === featuredSix ? 0 : sinceFeatured + 1;
      const i = name === undefined ? undefined : index.get(name);
      if (i !== undefined) counts[i]++;
      // Once all queried tails are saturated, later draws cannot change results.
      if (counts.every(count => count >= 6)) break;
    }
    const bonusIndex = rules.bonus ? index.get(rules.bonus) : undefined;
    if (pulls >= 300 && bonusIndex !== undefined) counts[bonusIndex]++;
    for (let i = 0; i < ops.length; i++) {
      const possible = counts[i] + (ops[i].spark ? Math.floor(contracts / ops[i].spark!) : 0);
      for (let n = 1; n <= 6; n++) if (possible >= n) hits[i][n - 1]++;
    }
    if (canComplete(counts, targets, ops, contracts)) allHits++;
  }
  const chance = (count: number, certain: boolean, impossible: boolean): Chance => ({ probability: certain ? 1 : impossible ? 0 : count / samples, certain, impossible });
  return {
    samples,
    copies: hits.map((row, i) => row.map((count, n) => chance(count,
      guaranteed[i] + (ops[i].spark ? Math.floor(contracts / ops[i].spark!) : 0) >= n + 1,
      pulls === 0))),
    all: chance(allHits, canComplete(guaranteed, targets, ops, contracts), pulls === 0),
  };
}
/** A sampled 100% is not a mathematical guarantee. */
export function formatChance(chance: Chance): string {
  if (chance.certain) return '100%';
  if (chance.impossible) return '0%';
  const value = chance.probability * 100;
  if (value < .1) return '<0.1%';
  if (value > 99.9) return '>99.9%';
  return `${value.toFixed(1)}%`;
}
