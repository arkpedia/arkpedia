import { Operator } from '@/lib/operators/operatorTypes';

/**
 * The only fields recruitment actually reads.
 *
 * This is a Pick rather than `Operator` so the compiler enforces it: the page
 * ships this pool to the browser, and typing it as the full record let
 * getStaticProps hand over every operator's skills, modules, talents, voice
 * actors and lore review as well -- 1.76 MB of dossier for a tag calculator
 * that needs a name, a rarity and some tags. A full Operator still satisfies
 * this, so build-time callers are unaffected.
 */
export type RecruitableOperator = Pick<Operator, 'name' | 'rarity' | 'tags' | 'position' | 'class' | 'isFuture'>;

export interface TagCombo {
  tags: string[];
  operators: RecruitableOperator[];
}

/** Qualification tags are rarity-locked: Starter is 2-star only, Senior
 * Operator is 5-star only, Top Operator is 6-star only -- matches the
 * real recruitment mechanic (1-star operators get "Robot" instead, not
 * "Starter"). */
function getQualificationTag(rarity: number | null): string | null {
  if (rarity === 2) return 'Starter';
  if (rarity === 5) return 'Senior Operator';
  if (rarity === 6) return 'Top Operator';
  return null;
}

/** Every tag an operator actually has for recruitment purposes: their
 * scraped affix tags, PLUS class/position/qualification computed
 * directly from operator fields rather than relying on the scraped tags
 * array to have captured those (more reliable). */
export function getEffectiveTags(operator: RecruitableOperator): string[] {
  const tags = new Set(operator.tags || []);
  if (operator.class) tags.add(operator.class);
  if (operator.position) tags.add(operator.position);
  const qualification = getQualificationTag(operator.rarity);
  if (qualification) tags.add(qualification);
  return Array.from(tags);
}

export interface TagCategories {
  classes: string[];
  positions: string[];
  qualifications: string[];
  tags: string[]; // everything else (the general affix-style tags)
}

/** Builds each row's options, derived from real operator data rather
 * than a hardcoded list. Qualification is the one fixed-order exception
 * (rarity-based, always exactly these three regardless of what's
 * actually present in the data). */
export function getRecruitmentTagCategories(operators: RecruitableOperator[]): TagCategories {
  const classes = new Set<string>();
  const positions = new Set<string>();
  const tags = new Set<string>();

  operators.forEach((op) => {
    if (op.class) classes.add(op.class);
    if (op.position) positions.add(op.position);
    op.tags?.forEach((t) => {
      if (t !== 'Starter') tags.add(t);
    });
  });

  return {
    classes: Array.from(classes).sort(),
    positions: Array.from(positions).sort(),
    qualifications: ['Starter', 'Senior Operator', 'Top Operator'],
    tags: Array.from(tags).sort(),
  };
}


/** Whether an operator's effective tags include every tag in `subset`,
 * applying the same 6-star/"Top Operator" gating as the real
 * recruitment mechanic (a 6-star only ever appears if "Top Operator"
 * is itself one of the tags being matched on). Shared by
 * computeTagCombos and computeGuaranteedCombos so this rule can't
 * drift between the two. */
function subsetMatches(subset: string[], tagSet: Set<string>, rarity: number | null): boolean {
  if (!subset.every((tag) => tagSet.has(tag))) return false;
  if (rarity === 6 && !subset.includes('Top Operator')) return false;
  return true;
}

/** All non-empty subsets of the selected tags (up to 5 tags -> up to 31
 * subsets), each paired with the operators that have every tag in that
 * subset. Subsets with zero matches are dropped. */
export function computeTagCombos(selectedTags: string[], operators: RecruitableOperator[]): TagCombo[] {
  const n = selectedTags.length;
  const combos: TagCombo[] = [];
  const MAX_COMBO_SIZE = 3; // a real recruitment slot only ever combines up to 3 tags at once, even though up to 5 can be selected to explore options

  const withTagSets = operators.map((op) => ({ op, tagSet: new Set(getEffectiveTags(op)) }));

  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: string[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(selectedTags[i]);
    }
    if (subset.length > MAX_COMBO_SIZE) continue;
    const matches = withTagSets.filter(({ op, tagSet }) => subsetMatches(subset, tagSet, op.rarity)).map(({ op }) => op);
    if (matches.length > 0) {
      combos.push({ tags: subset, operators: matches });
    }
  }

  // Multi-tag (more specific) combinations first, then fewer matching
  // operators before more (a smaller pool is more useful information).
  combos.sort((a, b) => b.tags.length - a.tags.length || a.operators.length - b.operators.length);

  return combos;
}

export interface GuaranteedCombo {
  tags: string[];
  minRarity: number;
  maxRarity: number;
  operatorCount: number;
  operatorNames: string[];
}

/** Every MINIMAL 2-3 tag combination, searched across the entire real
 * tag space (every class/position/qualification/general tag actually
 * present in the data -- not just a user-selected subset), whose
 * resulting operator pool has a rarity floor of at least minRarity.
 * "Minimal" means: if a 2-tag combo already guarantees the floor, no
 * 3-tag superset of it is included too -- adding more tags on top of
 * an already-sufficient pair can only shrink the pool or leave the
 * floor unchanged, never add new useful information, so it's dropped
 * as redundant. 6-star is deliberately not a target floor here since
 * Top Operator alone already unambiguously means 6-star, with nothing
 * left to look up.
 *
 * 1-tag combos ARE checked (confirmed by the user: some single general/
 * class/position tags genuinely are alone-sufficient for a 4-star+
 * floor -- the earlier assumption that none ever were was wrong).
 * Qualification tags themselves are still excluded from the candidate
 * pool below (Senior/Top Operator are rarity-exact by definition, not
 * something a cheat sheet needs to explain), but any OTHER single tag
 * that clears the floor on its own is included, and correctly makes
 * every 2- and 3-tag superset containing it redundant -- adding more
 * tags on top of an already-sufficient single one can only shrink the
 * pool or leave the floor unchanged, never add new useful information. */
export function computeGuaranteedCombos(operators: RecruitableOperator[], minRarity: 4 | 5 = 4): GuaranteedCombo[] {
  const categories = getRecruitmentTagCategories(operators);
  // Senior Operator/Top Operator are trivially rarity-exact on their
  // own (that's their entire purpose) -- including them as candidate
  // tags would just produce redundant, obvious-in-hindsight entries
  // like "AoE + Senior Operator -> 5-star guaranteed", which tells the
  // reader nothing they didn't already know from the tag's own name.
  const qualificationsToExclude = new Set(['Senior Operator', 'Top Operator']);
  const allTags = [
    ...categories.classes,
    ...categories.positions,
    ...categories.qualifications.filter((q) => !qualificationsToExclude.has(q)),
    ...categories.tags,
  ];
  const n = allTags.length;

  const withTagSets = operators.map((op) => ({ op, tagSet: new Set(getEffectiveTags(op)) }));

  function matchOperators(subset: string[]) {
    return withTagSets.filter(({ op, tagSet }) => subsetMatches(subset, tagSet, op.rarity)).map(({ op }) => op);
  }

  // Confirmed by the user: a 3-star operator in the pool DOES disqualify
  // a combo from the cheat sheet -- its recruitment time is long enough
  // that you can't distinguish it from a 4-star+ by the timer alone, so
  // there's genuine risk of completing the recruitment and landing on
  // the undesirable 3-star. A 1-star or 2-star operator in the pool does
  // NOT disqualify anything -- their recruitment time is short enough to
  // recognize and cancel/retry before ever completing it, so they're not
  // a real risk to the guarantee at all. Same convention already used by
  // comboShouldBeHidden further down this file, for the Calculator
  // section -- this just applies the identical rule to the cheat sheet's
  // own rarity-floor math, which previously used a naive Math.min()
  // across the WHOLE pool and let a stray 1/2-star silently drag a
  // combo's computed floor down below 4, excluding it from the sheet
  // even when it should have qualified.
  function hasThreeStarRisk(matches: RecruitableOperator[]): boolean {
    return matches.some((op) => op.rarity === 3);
  }
  function effectiveRarityRange(matches: RecruitableOperator[]): { minR: number; maxR: number } | null {
    const relevant = matches.filter((op) => (op.rarity ?? 0) >= 4);
    if (relevant.length === 0) return null;
    return { minR: Math.min(...relevant.map((op) => op.rarity ?? 0)), maxR: Math.max(...relevant.map((op) => op.rarity ?? 0)) };
  }

  const oneTagResults: GuaranteedCombo[] = [];
  for (let i = 0; i < n; i++) {
    const subset = [allTags[i]];
    const matches = matchOperators(subset);
    if (matches.length === 0) continue;
    if (hasThreeStarRisk(matches)) continue;
    const range = effectiveRarityRange(matches);
    if (!range) continue;
    if (range.minR >= minRarity) {
      oneTagResults.push({ tags: subset, minRarity: range.minR, maxRarity: range.maxR, operatorCount: matches.length, operatorNames: matches.map((op) => op.name) });
    }
  }
  const aloneSufficientTags = new Set(oneTagResults.map((c) => c.tags[0]));

  const twoTagResults: GuaranteedCombo[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const subset = [allTags[i], allTags[j]];
      // Skip if either tag alone already guarantees the floor on its
      // own -- this pair would be a redundant superset of a single tag
      // that's already sufficient by itself.
      if (subset.some((t) => aloneSufficientTags.has(t))) continue;
      const matches = matchOperators(subset);
      if (matches.length === 0) continue;
      if (hasThreeStarRisk(matches)) continue;
      const range = effectiveRarityRange(matches);
      if (!range) continue;
      if (range.minR >= minRarity) {
        twoTagResults.push({ tags: subset, minRarity: range.minR, maxRarity: range.maxR, operatorCount: matches.length, operatorNames: matches.map((op) => op.name) });
      }
    }
  }

  const threeTagResults: GuaranteedCombo[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const subset = [allTags[i], allTags[j], allTags[k]];
        // Skip if any single tag within this triple is alone-sufficient,
        // or if any 2-tag pair within it already guarantees the floor on
        // its own -- either way this triple is a redundant superset,
        // already covered by (and less useful than) the smaller combo.
        if (subset.some((t) => aloneSufficientTags.has(t))) continue;
        const isRedundant = twoTagResults.some((c) => c.tags.every((t) => subset.includes(t)));
        if (isRedundant) continue;
        const matches = matchOperators(subset);
        if (matches.length === 0) continue;
        if (hasThreeStarRisk(matches)) continue;
        const range = effectiveRarityRange(matches);
        if (!range) continue;
        if (range.minR >= minRarity) {
          threeTagResults.push({ tags: subset, minRarity: range.minR, maxRarity: range.maxR, operatorCount: matches.length, operatorNames: matches.map((op) => op.name) });
        }
      }
    }
  }

  const results = [...oneTagResults, ...twoTagResults, ...threeTagResults];
  // Most useful first: fewer tags (easier to spot in-game), then higher
  // guaranteed rarity, then smaller resulting pool (more specific/useful).
  results.sort((a, b) => a.tags.length - b.tags.length || b.minRarity - a.minRarity || a.operatorCount - b.operatorCount);

  return results;
}