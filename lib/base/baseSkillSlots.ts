/**
 * Which upgrade chain each base skill belongs to, and what unlocks it.
 *
 * GENERATED from the game's own building_data.json into data/base-skill-slots.json
 * -- do not hand-edit. It is a game table the content release carries: /base reads it
 * from its props (__contentTables['base-skill-slots']), so a gamedata refresh that
 * adds an operator needs a data update in arkpedia-data, not a redeploy. It used to
 * be this module, compiled into the /base chunk, which kept every operator added
 * after the last regeneration on the text heuristics until somebody redeployed.
 *
 * The scraped operator records carry only a name, a facility and an elite
 * tag, so combinedSkillsForElite() used to infer 'does the Elite 2 skill
 * replace the Elite 0 one, or run alongside it?' from the text: an explicit
 * "XReplacesY" suffix, a repeated name, or a description that normalises to
 * one already kept. That is right for the vast majority and wrong in ways
 * that are invisible -- Akafuyu's Nobukage-ryu carries none of those signals,
 * so her Guard Expert alpha kept applying and +30% was counted twice.
 *
 * `chars[].buffChar[]` in building_data.json says it outright: each entry is
 * one SLOT, and a slot's own list is its upgrade chain. Same slot means the
 * later skill replaces the earlier one; separate slots mean both stay live
 * (Laios keeps Curiosity at Elite 2 and gains Gourmand alongside it).
 *
 * `phase` is 0/1/2 for Elite 0/1/2. `level` is the operator level the upgrade
 * needs -- almost always 1, but Durin's Sleepiness replaces Laziness at level
 * 30 without any promotion at all.
 */
export interface BaseSkillSlot {
  slot: number;
  phase: number;
  level: number;
}

/** Keyed "OperatorName|SkillName|EliteTag" -- the skill name with any
 * "ReplacesX" suffix stripped, then the record's own elite tag, which is
 * what keeps the two same-named steps of a chain apart. */
export type BaseSkillSlots = Record<string, BaseSkillSlot>;
