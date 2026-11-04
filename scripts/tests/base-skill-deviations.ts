/** Skills the table reads as the game text says where the handlers or the text patterns did not, by operator: left out
 *  of the random roster here, each held to its corrected number in test-base-skill-corrections.ts. */
export const KNOWN_DEVIATIONS: Record<string, string> = {
  Raidian: "Drip-Fed Care's +0.05 Morale for the Control Center counted nothing (its handler returned an empty result).",
  Firewhistle: "Warm-Up's -0.1 for everyone in the Trading Post is room-wide, so it lowers the room's shared rate and dead time too.",
  'Wind Chimes': 'Hell and High Water and Distant Letter are room-wide like Warm-Up.',
  'THRM-EX': "Enthusiasm's -0.52 Morale was never applied: the Power Plant dropped its handler's Morale and the text pattern missed the wording.",
  Spuria: "Take-Away Fruit Tarts' -0.3 Morale was never applied, for the same reason; Technology Exchange α climbs by the hour like β.",
  Ripresa: 'Professional Manager α/β apply only while alone, Morale cost included; the text pattern read them unconditionally.',
  Harmonie: "Double Agent's +2 Morale per hour while alone was dropped with the handler.",
  Odda: "Professional Ethics' +1 Morale per hour while alone was dropped with the handler.",
  "Ho'olheyak": "Professional Ethics' +1 Morale per hour while alone was dropped with the handler.",
  Ukusik: "'Extra, Extra!' adds +5% Reception Room clue speed per extra recruit slot, as Law of the Streets does.",
  'Waai Fu': "Cooperative Will counts every full 5% the others provide: the handler's floor(0.3 / 0.05) gave 5 steps, a floating-point artefact, where the text gives 6.",
  Snowsant: 'Heavenly Reward α/β count every full 5% the others provide, with the same floating-point artefact gone.',
  'Zima the Raging Tide': "'Got It, Boss!' counts Ursus Student Self-Governing Group operators in the Reception Room and costs +0.5 Morale; Friends Forever's +10% needs one in the same Factory.",
  Taraxacum: "'The Best of Students!' counts every facility with a Sui operator, Dormitories included: the game words it as Elite Squad and 'Terra's Ark' are, which the handlers counted that way; the Taraxacum handler left Dormitories out.",
  // The record text of these six carries a no-break space in "Specialization Level", which the training module's mastery
  // pattern (a plain space) never matched, so their conditional bonus applied at every mastery.
  Heavyrain: "Field Experience's +45% applies only when training to Specialization 2.",
  Aurora: "Night Sky's +45% applies only when training to Specialization 1.",
  Mint: "Widely-Read's +45% applies only when training to Specialization 2.",
  Tomimi: "Tomimi's conditional training bonus applies only at its stated Specialization.",
  'Skadi the Corrupting Heart': "Mutation's +65% and its +1 Morale apply only when training to Specialization 3.",
  Necrass: "Why Cry For Freedom?'s +1 Morale applies only when training a Caster to Specialization 3.",
  Talulah: "Her CN-only training skills apply to Guards and Casters, and the +45% to the Primal Guard and Primal Caster branches; the text module read the Chinese as unconditional.",
  Caleido: 'Her CN-only Workshop skills raise the byproduct chance of Elite materials by 75% / 80%; the text module read nothing from the Chinese.',
  Homebound: "Light at the Fingertips applies to Chiral Refractor and Rephasic Enantiomer recipes alone; the text module applied it to every recipe.",
};
