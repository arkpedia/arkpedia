import type { StrongholdData, StrongholdOperator } from './stronghold';
import { foldName } from './strongholdPrice';

/**
 * What the Dispatch Center is worth taking from, band by band.
 *
 * The rest of the playbook answers "how is this alliance played". This answers the
 * question actually in front of a player mid-run: the shop is showing me six Tier II
 * operators, which of them matters. It is organised by TIER rather than by round,
 * because the tier is the thing on screen -- the rounds are only there to say roughly
 * where a band belongs.
 *
 * Every name is checked against the season's roster at build time by assertOpening,
 * for the same reason the playbook is: a pick naming an operator that does not exist
 * sends the player hunting something the shop can never offer, and does it silently.
 */

/**
 * How much of the run a pick commits you to.
 *
 *   leaning   picked up to keep the door open, not to walk through it
 *   lockdown  one of the best farmers is in hand; this is the run now
 *
 * There used to be an `early` level between nothing and leaning, on five picks that
 * merely made an alliance available. It is gone: what those picks were really saying
 * is said better by the squad, which either pays for an alliance or does not. See
 * STRATEGY_NUDGES -- a run under Chiave has Siracusa decided for it, and the tag on
 * those picks now comes from that rather than from the pick itself.
 */
export type Commit = 'leaning' | 'lockdown';


export interface OpeningFor {
  /** The alliance this pick serves. Absent where it serves the RUN rather than an
   *  alliance -- funds carried over, a free refresh, a slot filled for one Fund. */
  alliance?: string;
  /** Why it is worth taking, in the player's terms. */
  note: string;
  commit?: Commit;
}

export interface OpeningPick {
  operator: string;
  for: OpeningFor[];
}

/**
 * A follow-up that only exists once an alliance is locked down.
 *
 * "If Lock Down Committed Siracusa (because of Lappland and/or Vigil): Vulpisfoglia
 * for additional stacking; Texas and Provence if Siracusa isn't triggered yet." These
 * are conditional on a commitment rather than on a tier, so they hang off the band
 * they become relevant in and appear only when that alliance is the one selected.
 */
export interface OpeningBlock {
  alliance: string;
  /** The operators that put you here, named so the condition is checkable by eye. */
  because: string[];
  picks: { operator: string; note: string }[];
}

export interface OpeningBand {
  /** The Dispatch tier this band is about. */
  tier: string;
  /** Roughly where it falls, for the button. The rounds are a hint, not a rule. */
  rounds: string;
  picks: OpeningPick[];
  /** Worth taking only when nothing above it showed up. */
  fallback: string[];
  blocks: OpeningBlock[];
}



/**
 * Alliances that pay off without commitment, and what it takes.
 *
 * The distinction the guide opens with, and the one that decides how an add-on slot is
 * spent early: four of them trigger on two operators and simply want stacks after
 * that, while four more want three committed operators before they are worth anything.
 */
export const ALLIANCE_SHAPE: { kind: string; note: string; alliances: string[] }[] = [
  {
    kind: 'Early universal',
    note: '2 operators to trigger, 40 stacks to be good (50 for Raid). The earlier the farming starts, the better',
    alliances: ['Swift', 'Aid', 'Agile', 'Raid'],
  },
  {
    kind: 'Core + 1 add-on',
    note: '3 committed operators before it is worth anything',
    alliances: ['Precision', 'Arcane', 'Resilient', 'Durable'],
  },
];

/* --- what locks an alliance down ------------------------------------------------ */

/**
 * Lock-down units that belong to no band.
 *
 * Empty, and kept as the door rather than the furniture. It held Angelina, on the
 * reasoning that Tier V drew the board instead of a pick list and she had nowhere up
 * there to be written -- both halves of which stopped being true when bands V and VI
 * got picks of their own. She is a Tier V pick now, tagged `lockdown` there, which is
 * where the rest of the farmers are declared.
 */
const LATE_LOCKDOWNS: Record<string, string[]> = {};

/**
 * Who locks what down, read off the bands' own commit tags plus the late additions.
 * One source: a run is locked by owning one of exactly these, and the "you need one
 * of these" row is drawn from exactly the same list.
 */
/**
 * The guide's softer endorsements, keyed by alliance: a Leaning, or a Good Stacker.
 *
 * Both are "worth buying for this alliance" short of committing to it, but they are
 * not interchangeable -- a Leaning is a Core word (it keeps a door open) and Good
 * Stacker is an add-on word (it pays per stack). The caller decides which applies
 * by looking at the alliance's kind, so the two stay distinguishable here.
 */
export function nudgeMap(OPENING: OpeningBand[]): Map<string, { operator: string; kind: 'leaning' | 'stacker' }[]> {
  const out = new Map<string, { operator: string; kind: 'leaning' | 'stacker' }[]>();
  const add = (alliance: string, operator: string, kind: 'leaning' | 'stacker') => {
    const list = out.get(alliance) ?? [];
    if (!list.some((x) => x.operator === operator && x.kind === kind)) {
      out.set(alliance, [...list, { operator, kind }]);
    }
  };
  for (const band of OPENING) {
    for (const p of band.picks) {
      for (const f of p.for) {
        if (!f.alliance) continue;
        if (f.commit === 'leaning') add(f.alliance, p.operator, 'leaning');
        if (f.note.includes('Good Stacker')) add(f.alliance, p.operator, 'stacker');
      }
    }
  }
  return out;
}

export function lockdownMap(OPENING: OpeningBand[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (alliance: string, op: string) => {
    const list = out.get(alliance) ?? [];
    if (!list.includes(op)) out.set(alliance, [...list, op]);
  };
  for (const band of OPENING) {
    for (const p of band.picks) {
      for (const f of p.for) {
        if (f.commit === 'lockdown' && f.alliance) add(f.alliance, p.operator);
      }
    }
  }
  for (const [alliance, ops] of Object.entries(LATE_LOCKDOWNS)) {
    for (const op of ops) add(alliance, op);
  }
  return out;
}

/**
 * Who the guide calls a Good Stacker, per alliance -- read off the same pick
 * notes the tier bands display, so the "!" the roster draws and the words the
 * pick row says can never disagree. Only alliance-specific notes count: a
 * "Free choice, Good Stacker" with no alliance is praise for the operator,
 * not a claim about any one roster.
 */
export function goodStackerMap(OPENING: OpeningBand[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const band of OPENING) {
    for (const p of band.picks) {
      for (const f of p.for) {
        if (!f.alliance || !f.note.includes('Good Stacker')) continue;
        const list = out.get(f.alliance) ?? [];
        if (!list.includes(p.operator)) out.set(f.alliance, [...list, p.operator]);
      }
    }
  }
  return out;
}

/* --- the copiers ----------------------------------------------------------------- */

/**
 * The operators whose whole attribute is somebody else's attribute.
 *
 * Saria copies whatever <When Rest Phase ends> attribute stands ahead of her,
 * Ptilopsis the <When entering Rest Phase> one, Suzuran re-fires <When obtained>
 * ones -- which is also what the Investor alliance does to the whole squad -- and
 * Civilight Eterna adds a stack whenever the operator ahead adds stacks in battle.
 *
 * Who they pair with is therefore not editorial: it is every operator whose attribute
 * carries the timing they read, derived off the roster. The whole list, good or not --
 * kukki: "for now no matter if it's good or not just provide a list".
 */
export interface Copier {
  operator: string;
  /** How the row is labelled. Suzuran shares hers with the alliance doing the same. */
  label: string;
  /** The one line under the faces: what standing behind these actually does. */
  why: string;
  /** Whether an operator's attribute is one this copier can read. */
  reads: (op: StrongholdOperator) => boolean;
}

const attrsOf = (op: StrongholdOperator) =>
  [op.base_attribute, op.promoted_attribute].filter((a): a is string => !!a);
const tagged = (tag: string) => (op: StrongholdOperator) =>
  attrsOf(op).some((a) => a.startsWith(`<${tag}>`));

/** Confirmed pairings added on top of each copier's tag-derived list -- named
 *  directly rather than picked up by the attribute-tag heuristic, the same
 *  way specific Good Stacker gaps have been patched elsewhere in this file. */
const SARIA_EXTRA = ['Swire the Elegant Wit', 'Mint'];
const SUZURAN_EXTRA = ['Swire', 'Rockrock', 'Degenbrecher', 'Exusiai'];
const CIVILIGHT_ETERNA_EXTRA = ['Pramanix', 'SilverAsh the Reignfrost', 'Skadi'];

export const COPIERS: Copier[] = [
  {
    operator: 'Saria',
    label: 'Saria',
    why: 'copies their When Rest Phase ends attribute',
    reads: (op) => tagged('When Rest Phase ends')(op) || SARIA_EXTRA.includes(op.operator),
  },
  {
    operator: 'Ptilopsis',
    label: 'Ptilopsis',
    why: 'copies their When entering Rest Phase attribute',
    reads: tagged('When entering Rest Phase'),
  },
  /* kukki wrote "Suzuran and Marvel" -- but the alliance that re-fires 'When obtained'
     attributes is Investor; Marvel's bonus is free refreshes. Named for what the data
     says it does. */
  {
    operator: 'Suzuran',
    label: 'Suzuran / Investor',
    why: 're-fire their When obtained attribute',
    reads: (op) => tagged('When obtained')(op) || SUZURAN_EXTRA.includes(op.operator),
  },
  {
    operator: 'Civilight Eterna',
    label: 'Civilight Eterna',
    why: 'adds a stack whenever they add stacks in battle',
    /* "When the Operator in the tile ahead adds stacks from their Attribute": an
       in-battle attribute the build script read a stack clause out of. */
    reads: (op) => (tagged('In battle')(op) && !!(op.stacks?.length || op.stacks_promoted?.length))
      || CIVILIGHT_ETERNA_EXTRA.includes(op.operator),
  },
];


/**
 * 6-star operators, for New Player mode -- new players already have access
 * to everyone else, so that mode narrows the board down to just these (plus
 * the two named exceptions below).
 *
 * INCOMPLETE ON PURPOSE. This is seeded only with names actually confirmed
 * against an uploaded operators-6star file (Bellone, Blaze, Blaze the
 * Igniting Spark, Blemishine) -- not filled in from memory. One of those
 * files carries a 2026 release date, which means this roster runs well past
 * anything reliably known without a source, and guessing the rest risked
 * silently misclassifying operators rather than failing loudly. Extend this
 * set directly as more of the operators-6star folder is confirmed; nothing
 * else in New Player mode needs to change when it grows.
 */
/**
 * 6-star operators, for New Player mode -- new players already have access
 * to everyone else, so that mode narrows the board down to just these (plus
 * the two named exceptions below). The full list, given directly rather
 * than derived, since this roster runs well past anything this file could
 * confirm on its own. Spellings normalized to match the casing and accents
 * already established elsewhere in this file (SilverAsh, Młynar, Hvít Aska)
 * rather than however each was typed when the list was given.
 */
export const SIX_STAR_OPERATORS = new Set([
  'Swire the Elegant Wit', 'Hoshiguma', 'Blaze the Igniting Spark', 'Dusk', 'Qiubai', 'Yu',
  'Suzuran', 'Saria', 'Carnelian', 'Gavial the Invincible', 'Titi', 'Passenger', 'Pepe', 'Horn',
  'Reed the Flame Shadow', 'Vina Victoria', 'Bagpipe', 'Gnosis', 'SilverAsh', 'SilverAsh the Reignfrost',
  'Pramanix the Prerita', 'Degenbrecher', 'Archetto', 'Exusiai', 'Mostima', 'Executor the Ex Foedere',
  'Exusiai the New Covenant', 'Lemuen', 'Virtuosa', 'Skadi', 'Mizuki', 'Specter the Unchained',
  'Ulpianus', 'Skadi the Corrupting Heart', 'Vulpisfoglia', 'Texas the Omertosa', 'Angelina',
  'Lappland the Decadenza', 'Blemishine', 'Fartooth', 'Flametail', 'Młynar', 'Nearl the Radiant Knight',
  'Rosmontis', 'Nymph', 'Thorns the Lodestar', 'Entelechia', 'Astgenne the Lightchaser',
  'Eyjafjalla the Hvít Aska', 'Ines', 'Mountain', 'Surtr', 'Muelsyse',
]);

/** New Player mode's two named exceptions -- not 6-star, but every new
 *  player has them regardless. */
export const NEW_PLAYER_EXTRA_ACCESS = ['Vigil', 'Lumen'];

/** Strong in ANY lock-down, core or add-on: their value does not hang on an alliance.
 *  kukki's list, verbatim, in the roster's spellings. */
export const FREE_CHOICE = [
  'Ayerscarpe', 'Archetto', 'Thorns the Lodestar', 'Horn', 'Warfarin',
  'Eyjafjalla the Hvít Aska', 'Lumen', 'Muelsyse', 'Virtuosa', 'Yu',
];

/** Worth a slot in every locked-down CORE: a Damazti Isomorph carrying the Core's own
 *  equipment makes them count as members of it. */
export const ISOMORPH_CHOICE = ['Entelechia', 'Rosmontis'];

/**
 * What the Damazti Isomorph reads: the OTHER equipment on the operator decides the
 * alliance it grants. Copied from the Isomorph's own Talent text, which is the only
 * place the game states the pairing -- the items' own effects never name an alliance.
 * Both sides are checked at build time: the alliance against the season's list, the
 * item against the season's shop.
 */
export const ISOMORPH_ITEM: Record<string, string> = {
  Yan: 'Yanese Dagger',
  Victoria: 'Victorian Hammer',
  'Ægir': 'Ægirian Blade',
  Durable: 'Durable Shield',
  Sargon: 'Sargonian Teaspresso',
  Resilient: 'Tough Launcher',
  Laterano: 'Lateran Clip',
  Kjerag: 'Kjeragi Nevermeltice',
  Precision: 'Precision Scope',
  Raid: 'Raid Grenade',
  Swift: 'Quick Combat Rations',
  Kazimierz: 'Kazimierz Knightclub Pennant',
  Siracusa: 'Siracusan Formalwear',
  Arcane: 'Arcane Arts Circle',
};

/* --- how the mode is played ---------------------------------------------------- */

/**
 * The things that are true about a run whatever you build.
 *
 * Kept apart from the tier bands because it is a different kind of knowledge: the
 * bands answer "which of these six", and this answers "what is this mode actually
 * about". Read once and then occasionally re-read, which is why it lives behind a tab
 * rather than on the screen.
 */
export const GUIDE: {
  solo: { head?: string; text: string }[];
  coop: { head?: string; text: string }[];
  rounds: { at: string; steps: string[] }[];
} = {
  solo: [
    {
      head: 'Losing lives is allowed',
      text: 'It is okay to lose lives as long as you do not lose them all. Leaking is a legitimate strategy in Stronghold Protocol.',
    },
    {
      text: 'Do not keep your units in the same position all the time. Repositioning is crucial against the different types of enemies.',
    },
  ],
  coop: [
    {
      head: 'Losing lives is allowed',
      text: 'It is okay to lose lives as long as you do not lose them all. Leaking is a legitimate strategy here -- you can build up while your allies clear for the moment. Just help them back after.',
    },
    {
      head: 'The operator pool is shared',
      text: 'There is a set number of every operator in the game. Two people chasing copies of the same unit can still be fine, but the odds of seeing your third copy get worse. Three people on the same units and the game can disintegrate -- so watch what your allies are building and build differently.',
    },
    {
      text: 'Do not keep your units in the same position all the time. Repositioning is crucial against the different types of enemies.',
    },
  ],
  rounds: [
    { at: '1', steps: ['Choose any two units and try to win the stage'] },
    {
      at: '2',
      steps: ['Upgrade to Dispatch Level 2', 'Buy the previous round\u2019s item by freezing it, or the current round\u2019s'],
    },
    { at: '3', steps: ['Buy more units to attempt winning the round'] },
    {
      at: '4-5',
      steps: [
        'Pursue Dispatch Level 3',
        'Buy more units with the coins left',
        'Activate and stack Aid, Agile, Swift and/or Raid with good low-tier units',
        'Do not chase triple copies until Dispatch Level 3',
      ],
    },
    {
      at: '6-8',
      steps: [
        'Pursue Dispatch Level 4',
        'Stack Raid, Aid, Agile and/or Swift to the 40 (50 for Raid) that pays the sweeter bonus',
        'Watch for Commit operators: the best farmers for a core or add-on. Getting one plans the direction of the run',
        'Commit beats Leaning for turbo-sizing a squad',
      ],
    },
    {
      at: '8-11',
      steps: [
        'Pursue Dispatch Level 5',
        'Commit to the lock-down alliance and one or more stacked add-ons, finding the bridge units that count for both',
      ],
    },
    {
      at: '10-15',
      steps: ['The game is yours to control. Enjoy the stacks and work out how you want to reach the peak of your teams'],
    },
  ],
};

/** Every operator name the guide mentions, for the build-time check. */
function namesInOpening(OPENING: OpeningBand[]): string[] {
  const out: string[] = [];
  for (const band of OPENING) {
    for (const p of band.picks) out.push(p.operator);
    out.push(...band.fallback);
    for (const b of band.blocks) {
      out.push(...b.because);
      for (const p of b.picks) out.push(p.operator);
    }
  }
  out.push(...Object.values(LATE_LOCKDOWNS).flat());
  out.push(...COPIERS.map((c) => c.operator));
  out.push(...FREE_CHOICE, ...ISOMORPH_CHOICE);
  return out;
}

/**
 * Fails the build rather than the run.
 *
 * The reviewed data/stronghold-opening.json guide is hand-written and every line of it is
 * a name. A misspelling would not throw; it would simply never match, and the pick
 * would go missing from a list nobody knew was one short.
 */
export function assertOpening(data: StrongholdData, OPENING: OpeningBand[]): void {
  const ops = new Set(data.operators.map((o) => foldName(o.operator)));
  const alliances = new Set(data.alliances.map((a) => foldName(a.alliance)));
  const bad: string[] = [];
  for (const n of namesInOpening(OPENING)) {
    if (!ops.has(foldName(n))) bad.push(`operator "${n}"`);
  }
  for (const band of OPENING) {
    for (const p of band.picks) {
      for (const f of p.for) {
        if (f.alliance && !alliances.has(foldName(f.alliance))) bad.push(`alliance "${f.alliance}"`);
      }
    }
    for (const b of band.blocks) {
      if (!alliances.has(foldName(b.alliance))) bad.push(`alliance "${b.alliance}"`);
    }
  }
  for (const shape of ALLIANCE_SHAPE) {
    for (const a of shape.alliances) {
      if (!alliances.has(foldName(a))) bad.push(`alliance "${a}"`);
    }
  }
  for (const a of Object.keys(LATE_LOCKDOWNS)) {
    if (!alliances.has(foldName(a))) bad.push(`alliance "${a}"`);
  }
  const shopItems = new Set(data.items.map((i) => foldName(i.name)));
  for (const [a, item] of Object.entries(ISOMORPH_ITEM)) {
    if (!alliances.has(foldName(a))) bad.push(`alliance "${a}"`);
    if (!shopItems.has(foldName(item))) bad.push(`item "${item}"`);
  }
  if (bad.length) {
    throw new Error(`Stronghold opening guide does not match the roster:\n  ${[...new Set(bad)].join('\n  ')}`);
  }
}

export interface OpeningRow {
  op: StrongholdOperator;
  /** Why this one is on the list, already filtered to what the player asked about. */
  reasons: OpeningFor[];
}

/**
 * The band, filtered to the run.
 *
 * With nothing chosen it is the whole band: this is the general shopping list, and the
 * general list is the point of an opening guide. Choosing an alliance narrows it to
 * what serves that alliance -- every level of commitment, because having picked does
 * not make the early picks stop working -- and turns on the follow-up blocks written
 * for it. Bans trim throughout, both by operator and by alliance.
 */
export function openingFor(opts: {
  data: StrongholdData;
  band: OpeningBand;
  chosen: string[];
  banned?: Iterable<string>;
  bannedAlliances?: Iterable<string>;
}): {
    rows: OpeningRow[];
    fallback: StrongholdOperator[];
    blocks: { alliance: string; because: string[]; rows: OpeningRow[] }[];
  } {
  const { data, band, chosen } = opts;
  const outOps = new Set([...(opts.banned ?? [])].map(foldName));
  const outAlliances = new Set([...(opts.bannedAlliances ?? [])].map(foldName));
  const picked = new Set(chosen.map(foldName));
  const find = (name: string) => data.operators.find((o) => foldName(o.operator) === foldName(name)) ?? null;
  const kindOf = (name: string) => data.alliances
    .find((a) => foldName(a.alliance) === foldName(name))?.alliance_type;
  const allowed = (name: string) => !outOps.has(foldName(name));

  const rows: OpeningRow[] = [];
  for (const pick of band.picks) {
    const op = find(pick.operator);
    if (!op || !allowed(pick.operator)) continue;
    const reasons = pick.for.filter((f) => {
      if (f.alliance && outAlliances.has(foldName(f.alliance))) return false;
      if (!picked.size) return true;
      /* A pick with no alliance serves the run itself -- funds, a refresh -- and stays
         useful whatever you settled on, so it is never narrowed away. */
      if (!f.alliance) return true;
      if (picked.has(foldName(f.alliance))) return true;
      /*
       * And an add-on survives whether or not it was picked.
       *
       * Narrowing to the chosen alliances emptied the low tiers, because almost
       * everything worth taking at Tier I and II is an add-on: Swift, Aid, Agile and
       * Raid trigger on two operators and want nothing but stacks after that, so they
       * are worth taking under any Core. Hiding them because the Core was settled
       * hid the part of the shop that is settled LAST.
       */
      return kindOf(f.alliance) === 'Add-on';
    });
    /* The row stays as long as the OPERATOR is allowed -- reasons only narrow.
       A banned alliance takes its note away, never the operator: Insider is Swift
       AND Laterano, and banning Swift must not make him vanish from the list. An
       operator whose every alliance is banned never reaches here at all, because
       the caller's ban list already dropped him. */
    rows.push({ op, reasons });
  }

  const blocks = band.blocks
    .filter((b) => picked.has(foldName(b.alliance)) && !outAlliances.has(foldName(b.alliance)))
    .map((b) => ({
      alliance: b.alliance,
      because: b.because,
      rows: b.picks
        .map((p) => ({ op: find(p.operator), note: p.note }))
        .filter((x): x is { op: StrongholdOperator; note: string } => !!x.op && allowed(x.op.operator))
        .map((x) => ({ op: x.op, reasons: [{ note: x.note }] })),
    }))
    .filter((b) => b.rows.length > 0);

  /* The fallback is what you take when nothing above turned up, so it is only ever
     about the general list -- once an alliance is chosen there is a better answer. */
  const fallback = picked.size
    ? []
    : band.fallback.map(find).filter((o): o is StrongholdOperator => !!o && allowed(o.operator));

  return { rows, fallback, blocks };
}