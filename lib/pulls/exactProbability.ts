import { canComplete, guaranteedCopies, selectedRules, sixStarChance, type Chance, type OddsOperator, type OddsRequest, type OddsResult } from './probability';

interface Transition { control: number; target: number; probability: number }
const MAX_STATES = 400000;
const MAX_VISITS = 60000000;

/** Forward probability propagation over pity, guarantees and capped copy counts.
 * No random draws or independent-marginal multiplication. A bounded work limit
 * refuses unusually large requests rather than silently returning sampled odds. */
export function calculateOdds(request: OddsRequest): OddsResult {
  const rules = selectedRules(request);
  const { pulls, targets } = request;
  if (!Number.isInteger(pulls) || pulls < 0 || pulls > 100000 || !targets.length || targets.length > 20 || new Set(targets.map(t => t.name)).size !== targets.length) throw Error('Invalid probability request.');
  const ops = targets.map(target => {
    const op = rules.operators.find(op => op.name === target.name);
    if (!op || !Number.isInteger(target.copies) || target.copies < 1 || target.copies > 6) throw Error('A selected goal is no longer available on this banner. Choose it again.');
    return op;
  });
  const contracts = request.spark && rules.type === 'limited' ? pulls : 0;
  const guaranteed = ops.map(op => guaranteedCopies(rules, op, pulls));
  const chance = (probability: number, certain: boolean): Chance => ({ probability: certain ? 1 : Math.max(0, Math.min(1, probability)), certain, impossible: probability === 0 && !certain });
  if (!pulls) return { method: 'exact', samples: 0, copies: ops.map(() => Array.from({ length: 6 }, () => chance(0, false))), all: chance(0, false) };
  if (!canComplete(guaranteed, targets, ops, contracts) && targets.reduce((size, target) => size * (target.copies + 1), 1) > MAX_STATES) throw complexityError();
  let visits = 0;
  // Each marginal needs only seven count states, even when the joint request has
  // several operators. Joint counts stop at the reader's actual copy goals.
  const marginal = new Map<string, Chance[]>();
  for (const op of ops) {
    const guaranteedCount = guaranteedCopies(rules, op, pulls) + (op.spark ? Math.floor(contracts / op.spark) : 0);
    if (guaranteedCount >= 6) { marginal.set(op.name, Array.from({ length: 6 }, () => chance(1, true))); continue; }
    const distribution = propagate([op], [6], false);
    marginal.set(op.name, Array.from({ length: 6 }, (_, index) => {
      let probability = 0;
      for (const [count, mass] of distribution) if (count + (op.spark ? Math.floor(contracts / op.spark) : 0) >= index + 1) probability += mass;
      return chance(probability, guaranteedCount >= index + 1);
    }));
  }
  let all: Chance;
  if (targets.length === 1) all = marginal.get(ops[0].name)![targets[0].copies - 1];
  else if (canComplete(guaranteed, targets, ops, contracts)) all = chance(1, true);
  else {
    const distribution = propagate(ops, targets.map(target => target.copies), true);
    all = chance(distribution.get(-1) ?? 0, false);
  }
  return { method: 'exact', samples: 0, copies: ops.map(op => marginal.get(op.name)!), all };

  function propagate(queried: OddsOperator[], caps: number[], joint: boolean): Map<number, number> {
    const strides: number[] = []; let countSpace = 1;
    for (const cap of caps) { strides.push(countSpace); countSpace *= cap + 1; }
    if (countSpace > MAX_STATES) throw complexityError();
    const decode = (code: number) => caps.map((cap, i) => Math.floor(code / strides[i]) % (cap + 1));
    const increment = queried.map((_, i) => Float64Array.from({ length: countSpace }, (_, code) => Math.floor(code / strides[i]) % (caps[i] + 1) < caps[i] ? code + strides[i] : code));
    const succeeds = joint ? Uint8Array.from({ length: countSpace }, (_, code) => +canComplete(decode(code), targets, ops, contracts)) : null;
    const index = new Map(queried.map((op, i) => [op.name, i]));
    const sinceSize = rules.type === 'crossover' ? 120 : rules.type === 'single' ? 151 : 1;
    const needsFive = queried.some(op => op.rarity === 5);
    const pair = rules.type === 'crossover' && rules.operators.filter(op => op.rarity === 5 && op.kind === 'featured').length > 1;
    // Flags store the first-ten qualifier only when a five-star is queried,
    // plus either the single-banner safety net or crossover pair progress.
    const flagSpace = rules.type === 'crossover' ? needsFive ? pair ? 8 : 4 : 1 : rules.type === 'single' ? needsFive ? 4 : 2 : needsFive ? 2 : 1;
    const controlSpace = 99 * sinceSize * flagSpace;
    const six = rules.operators.filter(op => op.rarity === 6);
    const five = rules.operators.filter(op => op.rarity === 5);
    const featuredSix = six.find(op => op.kind === 'featured')?.name;
    const featuredFives = five.filter(op => op.kind === 'featured');
    const fiveShare = featuredFives.reduce((sum, op) => sum + op.share, 0);
    const saturatedFives = Uint8Array.from({ length: countSpace }, (_, code) => +queried.every((op, i) => op.rarity !== 5 || Math.floor(code / strides[i]) % (caps[i] + 1) === caps[i]));
    const cache = new Map<number, Transition[]>();
    function transitions(control: number, phase: number, ignoreFives: boolean): Transition[] {
      if (ignoreFives) {
        // Once every queried five-star count is saturated, their guarantees
        // cannot affect the result. Merge those histories while retaining pity.
        phase = 0;
        const flags = Math.floor(control / (99 * sinceSize));
        control = control % (99 * sinceSize) + (rules.type === 'single' ? flags & (needsFive ? 2 : 1) : 0) * 99 * sinceSize;
      }
      const cacheKey = control * 8 + phase * 2 + +ignoreFives;
      const cached = cache.get(cacheKey); if (cached) return cached;
      const pity = control % 99;
      const since = Math.floor(control / 99) % sinceSize;
      const flags = Math.floor(control / (99 * sinceSize));
      const firstTenDone = !needsFive || !!(flags & 1);
      const usedSingle = rules.type === 'single' && !!(flags & (needsFive ? 2 : 1));
      const progress = rules.type === 'crossover' && needsFive ? flags >> 1 : 0;
      const hardSix = rules.type === 'crossover' && since === 119;
      const singleGuarantee = rules.type === 'single' && !usedSingle && since === 150;
      const sixRate = hardSix ? 1 : sixStarChance(pity);
      const fiveRate = phase === 1 && !firstTenDone ? 1 - sixRate : (1 - sixRate) * (.08 / .98);
      const result = new Map<number, Transition>();
      const add = (name: string | undefined, rarity: number, probability: number) => {
        if (!probability) return;
        const target = name === undefined ? -1 : index.get(name) ?? -1;
        const nextUsed = usedSingle || (rarity === 6 && singleGuarantee);
        const nextSince = nextUsed || sinceSize === 1 ? 0 : name === featuredSix ? 0 : Math.min(sinceSize - 1, since + 1);
        let nextProgress = progress;
        if (!ignoreFives && rules.type === 'crossover' && rarity === 5 && featuredFives.some(op => op.name === name)) {
          if (progress === 0 && featuredFives.length > 1) nextProgress = featuredFives[0].name === name ? 2 : 1;
          else nextProgress = pair ? 3 : 1;
        }
        const nextFlags = (!ignoreFives && (firstTenDone || rarity >= 5 || phase >= 1) ? 1 : 0) + (nextUsed ? needsFive ? 2 : 1 : 0) + nextProgress * 2;
        const nextControl = (rarity === 6 ? 0 : pity + 1) + 99 * (nextSince + sinceSize * nextFlags);
        const key = nextControl * (queried.length + 1) + target + 1;
        const previous = result.get(key);
        if (previous) previous.probability += probability;
        else result.set(key, { control: nextControl, target, probability });
      };
      const pool = (entries: OddsOperator[], probability: number) => {
        let remaining = 1;
        for (const op of entries) { add(op.name, op.rarity, probability * op.share); remaining -= op.share; }
        add(undefined, entries === six ? 6 : 5, probability * Math.max(0, remaining));
      };
      if (hardSix || singleGuarantee) add(featuredSix, 6, sixRate);
      else pool(six, sixRate);
      if (ignoreFives) add(undefined, 4, 1 - sixRate);
      else if (rules.type === 'crossover' && pair && (progress === 1 || progress === 2)) add(featuredFives[progress - 1]?.name, 5, fiveRate);
      else if (rules.type === 'crossover' && phase === 3 && progress === 0 && fiveShare > 0) {
        for (const op of featuredFives) add(op.name, 5, fiveRate * op.share / fiveShare);
      } else pool(five, fiveRate);
      if (!ignoreFives) add(undefined, 4, Math.max(0, 1 - sixRate - fiveRate));
      const rows = [...result.values()]; cache.set(cacheKey, rows); return rows;
    }
    let initial = 0;
    if (pulls >= 300 && rules.bonus) {
      // This deterministic future gift can be credited before propagation:
      // it changes copy goals, never pull outcomes or any pity counter.
      const bonus = index.get(rules.bonus); if (bonus !== undefined) initial += strides[bonus];
    }
    const dense = countSpace * controlSpace <= 8000000;
    let values = dense ? new Float64Array(countSpace * controlSpace) : null;
    let nextValues = dense ? new Float64Array(countSpace * controlSpace) : null;
    let state = new Map<number, number>();
    let keys = [initial * controlSpace];
    if (values) values[keys[0]] = 1; else state.set(keys[0], 1);
    let absorbed = 0;
    for (let pull = 1; pull <= pulls && keys.length; pull++) {
      const next = new Map<number, number>();
      const nextKeys: number[] = [];
      const phase = pull < 10 ? 0 : pull === 10 ? 1 : pull <= 50 ? 2 : 3;
      for (const key of keys) {
        const mass = values ? values[key] : state.get(key)!;
        if (values) values[key] = 0;
        if (++visits > MAX_VISITS) throw complexityError();
        const count = Math.floor(key / controlSpace), control = key % controlSpace;
        // Success is absorbing: later pulls cannot undo it.
        if (joint ? succeeds![count] : count === caps[0]) { absorbed += mass; continue; }
        for (const outcome of transitions(control, phase, !!saturatedFives[count])) {
          const nextCount = outcome.target < 0 ? count : increment[outcome.target][count];
          const nextKey = nextCount * controlSpace + outcome.control;
          const probability = mass * outcome.probability;
          if (!probability) continue;
          const previous = nextValues ? nextValues[nextKey] : next.get(nextKey) ?? 0;
          if (!previous) {
            nextKeys.push(nextKey);
            if (nextKeys.length > MAX_STATES) throw complexityError();
          }
          if (nextValues) nextValues[nextKey] = previous + probability;
          else next.set(nextKey, previous + probability);
        }
      }
      if (nextKeys.length > MAX_STATES) throw complexityError();
      state = next; keys = nextKeys;
      [values, nextValues] = [nextValues, values];
    }
    const totals = new Map<number, number>();
    if (joint) {
      for (const key of keys) if (succeeds![Math.floor(key / controlSpace)]) absorbed += values ? values[key] : state.get(key)!;
      totals.set(-1, absorbed);
    } else {
      totals.set(caps[0], absorbed);
      for (const key of keys) {
        const mass = values ? values[key] : state.get(key)!;
        const count = Math.floor(key / controlSpace);
        totals.set(count, (totals.get(count) ?? 0) + mass);
      }
    }
    return totals;
  }
}
function complexityError() { return Error('This combination exceeds the exact calculation limit. Try fewer operator goals or a smaller pull budget.'); }
