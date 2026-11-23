import { mitigate, type DamageType, type Target } from './calculator';
type Values = Record<string, number>;
export interface SourceInputs {
  id: string;
  slot: number;
  atk: number;
  interval: number;
  target: Target;
  skill: Values;
  talent: Values;
  second: Values;
  trait: Values;
  proc: boolean;
  inRange: boolean;
}
export const elements: Record<string, string> = Object.fromEntries(
  Object.entries({
    Rampage: 'caledo',
    Necrosis: 'phonor threye cello kaitou nymph logos ebnhlz philae',
    Burn: 'warmy blaze2 yu ifrit bobb vvana oxi',
    'Nervous Impairment': 'phatm2 graceb christ mantra thorns cairn',
    Corrosion: 'mlyss thumpy clemnt tanya botany',
  }).flatMap(([kind, names]) => names.split(' ').map((name) => [name, kind])),
);

// A named damage source has its own cadence. A null cadence means one discrete
// activation, not a repeating attack at the operator's normal attack interval.
export function sourceAction({
  id,
  slot,
  atk,
  interval,
  target: t,
  skill: s,
  talent: a,
  second: b,
  trait: m,
  proc,
  inRange,
}: SourceInputs): {
  parts: Record<DamageType, number>;
  injury: number;
  cadence: number | null;
  name: string;
  note: string;
} | null {
  const bursting = t.burst === elements[id];
  const locked = t.burst !== 'None';
  const parts: Record<DamageType, number> = { Physical: 0, Arts: 0, True: 0, Elemental: 0 };
  let rawInjury = 0,
    cadence: number | null = interval,
    name = 'Normal attack';
  let note = '',
    focus = false;
  let injuryAmp = 1;
  const amount = (type: DamageType, scale: number) => mitigate(atk * scale, type, t);
  const hit = (type: DamageType, scale = 1, count = 1) => {
    parts[type] += amount(type, scale) * count;
  };
  const art = () => hit('Arts');
  const trigger = (label: string) => {
    name = label;
    cadence = null;
  };
  const field = (label: string, period: number) => {
    name = label;
    cadence = period;
  };
  if (['threye', 'bobb', 'botany', 'cello'].includes(id) && t.tier !== 'Grunt')
    injuryAmp *= m.ep_damage_scale ?? 1;
  if (
    !slot &&
    ![
      'phonor',
      'thumpy',
      'oxi',
      'cello',
      'cairn',
      'yu',
      'ifrit',
      'logos',
      'thorns',
      'vvana',
      'mlyss',
    ].includes(id)
  )
    return null;
  switch (id) {
    case 'phonor':
      art();
      rawInjury = a['attack@dark_damage_value'] ?? 0;
      parts.Arts *= a.damage_scale ?? 1;
      note =
        'During the deployment talent window. Outside it the robot loses the fixed injury and fragility.';
      break;
    case 'caledo':
      if (slot === 1) trigger('Charged strike');
      hit('Physical', s.atk_scale ?? 1);
      rawInjury = atk * (s.ep_damage_ratio && slot === 1 ? s.ep_damage_ratio : s['attack@ep_damage_ratio']);
      injuryAmp *= m.ep_damage_scale ?? 1;
      note = 'One blocked target. Outgoing Rampage only.';
      break;
    case 'graceb':
      if (slot === 2) {
        trigger('Charged triple strike');
        hit(bursting ? 'Elemental' : 'Physical', s.atk_scale, 3);
        break;
      }
      hit('Physical', s['attack@atk_scale'], 2);
      rawInjury = parts.Physical * s.ep_damage_ratio;
      name = 'Two strikes';
      note = 'Before the first kill of a target in Paralysis fallout.';
      break;
    case 'kaitou':
    case 'nymph':
    case 'warmy':
    case 'christ':
      if (id === 'nymph' && slot === 3) {
        hit(bursting ? 'Elemental' : 'Arts');
      } else if (id === 'nymph' && slot === 2) {
        trigger('Primary and splash hits');
        hit('Arts', s.atk_scale, 2);
        rawInjury = parts.Arts * s.ep_damage_ratio;
      } else if (id === 'christ' && slot === 2) {
        field('Sensory Spirit tick', s.interval);
        hit('Arts', s.atk_scale);
        if (bursting) hit('Elemental', s.atk_scale_ep);
      } else {
        art();
        rawInjury = parts.Arts * (s['attack@ep_damage_ratio'] ?? 0);
        if (bursting) hit('Elemental', s['attack@extra_ep_damage_scale'] ?? s['attack@ep_damage_scale'] ?? 0);
      }
      if (bursting) {
        parts.Arts *= m.damage_scale ?? 1;
        parts.Elemental *= m.damage_scale ?? 1;
      }
      note = 'Direct attack or spirit only. Burst-entry talents and ongoing fallout are separate events.';
      break;
    case 'philae':
      trigger('Retaliation');
      hit('Arts', s.atk_scale);
      rawInjury = atk * s.ep_damage_ratio;
      note =
        'One retaliation against a blocked attacker, before receiving injury. Limited by the skill cooldown of ' +
        s.aoe_cd +
        ' s.';
      injuryAmp *= m.ep_damage_scale ?? 1;
      break;
    case 'tanya':
      trigger('Cracking Dam stack');
      rawInjury = atk * s.ep_damage_ratio;
      injuryAmp *= m.ep_damage_scale ?? 1;
      note = 'Consumes one stored stack when struck while blocking.';
      break;
    case 'threye':
    case 'bobb':
    case 'botany':
      if (slot === 1) {
        trigger('Empowered attack');
        hit('Arts', s.atk_scale);
        rawInjury = atk * s.ep_damage_ratio;
        if (id === 'botany' && !bursting) {
          hit('Arts', s['botany_s1_extra.atk_scale']);
          rawInjury += atk * s['botany_s1_extra.ep_damage_ratio'];
        }
        break;
      }
      if (id === 'threye') {
        art();
        rawInjury = atk * s['attack@ep_damage_ratio'];
        note = 'One target outside Integrated Strategies.';
        break;
      }
      if (id === 'bobb') {
        field('Burning field tick', 1);
        hit('Arts', s['attack@atk_scale']);
        rawInjury = atk * s['attack@ep_damage_ratio'];
        note = 'Field only, on a grounded target.';
        break;
      }
      art();
      hit('Physical', s['attack@extra_atk_scale']);
      rawInjury = atk * s['attack@ep_damage_ratio'];
      break;
    case 'mlyss':
      hit('Physical');
      rawInjury = parts.Physical * (m.ep_damage_ratio ?? 0);
      note = 'Muelsyse herself. The copied operator determines Flowing Shape’s damage.';
      break;
    case 'ifrit': {
      const arts = mitigate(atk, 'Arts', { ...t, res: Math.max(0, t.res * (1 + (a.magic_resistance ?? 0))) });
      parts.Arts = arts;
      rawInjury = arts * (m.ep_damage_ratio ?? 0);
      if (bursting) hit('Elemental', m.element_atk_scale ?? 0);
      break;
    }
    case 'logos': {
      const debuffed = { ...t, res: Math.max(0, t.res + (b.magic_resistance ?? 0)) };
      parts.Arts = mitigate(atk + (b.atk_addition ?? 0), 'Arts', debuffed);
      rawInjury = parts.Arts * (m.ep_damage_ratio ?? 0);
      note = 'Primary hit on an already debuffed enemy. Random Lexical Evolution hits are separate.';
      break;
    }
    case 'ebnhlz':
      trigger('Old Day Remnant');
      hit('Arts', s.atk_scale);
      rawInjury = parts.Arts * (m.ep_damage_ratio ?? 0);
      note = 'One remnant detonation. Placement and stored charges determine how many connect.';
      break;
    case 'blaze2':
      if (slot === 3) {
        art();
        if (bursting) hit('Elemental', s['attack@atk_scale']);
        name = 'Ammunition hit';
        break;
      }
      if (slot === 2) {
        field('Burning field tick', 1);
        hit('Arts', s.atk_scale);
        rawInjury = parts.Arts * s.element_damage_scale;
        note = 'One field on one target, excluding direct attacks.';
        break;
      }
      field('Ally-centred pulse', s.interval);
      hit('Arts', s.atk_scale);
      rawInjury = parts.Arts * s.element_multiplier;
      note = 'One target beside the chosen ally. Excludes the separate talent hit on burst entry.';
      break;
    case 'mantra':
      if (slot === 3) {
        trigger('Paralysis overflow');
        hit('Elemental', s.atk_scale);
        note = 'One excess stack on the target. Requires gaining Paralysis above the skill limit.';
        break;
      }
      if (slot === 2) {
        hit('Arts', s['attack@atk_scale']);
        rawInjury = parts.Arts * s['attack@ep_damage_ratio'];
        if (bursting) {
          hit('Elemental', s['attack@element_atk_scale']);
          parts.Elemental *= m.damage_scale ?? 1;
          parts.Arts *= m.damage_scale ?? 1;
        }
        name = 'Primary chain hit';
        note = 'One target, before jumps.';
        break;
      }
      trigger('Resonance Collapse');
      hit('Arts', s.atk_scale);
      rawInjury = parts.Arts * s.ep_damage_ratio;
      if (bursting) {
        hit('Elemental', s.element_atk_scale);
        parts.Arts *= m.damage_scale ?? 1;
        parts.Elemental *= m.damage_scale ?? 1;
      }
      break;
    case 'cello':
      injuryAmp *= b.ep_damage_scale ?? 1;
      if (slot) {
        trigger('Golden Ecstasy');
        hit('Arts', s.atk_scale);
        rawInjury = atk * s.ep_damage_ratio;
      } else {
        field('Talent aura', 1);
        rawInjury = atk * (a.ep_damage_ratio ?? 0);
      }
      note = 'The aura and skill can be compared as separate sources.';
      break;
    case 'yu':
      injuryAmp *= m.ep_damage_scale ?? 1;
      if (slot) {
        trigger('Retaliation');
        rawInjury = atk * s.ep_damage_ratio;
      } else {
        field('Blocked enemy aura', a['yu_t_1[enemy].interval'] ?? 1);
        hit('Arts', a['yu_t_1[enemy].atk_scale'] ?? 0);
        rawInjury = atk * (a['yu_t_1[enemy].ep_damage_ratio'] ?? 0);
      }
      note = 'Target is blocked by Yu.';
      break;
    case 'thumpy':
      if (slot) {
        field(slot === 2 ? 'Glue tick' : 'Conveyor tick', s.interval);
        hit('Physical', s.atk_scale);
      } else hit('Physical');
      rawInjury = atk * (a['ep_damage_ratio[trigger]'] ?? 0);
      note = 'Unblocked target, zero talent stacks. Secondary hits from other allies are excluded.';
      break;
    case 'thorns': {
      hit('Physical');
      rawInjury = parts.Physical * (m.ep_damage_ratio ?? 0);
      note = 'Melee primary strike. Venom ticks and conversion are separate sources.';
      break;
    }
    case 'vvana': {
      const factor = t.tier === 'Grunt' ? 1 : (a.super_scale ?? 1);
      hit('Arts', 1, slot ? 2 : 1);
      parts.Arts *= 1 + (a.damage_scale_m ?? 0) * factor;
      rawInjury = parts.Arts * (a.ep_damage_ratio_m ?? 0) * factor;
      if (bursting) hit('Elemental', m.ep_damage_ratio ?? 0, slot ? 2 : 1);
      note = 'First skill activation.';
      break;
    }
    case 'oxi':
      if (slot) {
        field('Fire wave', s.normal_interval);
        hit(bursting ? 'Elemental' : 'Arts', s.heatwave_atk_scale);
      } else art();
      rawInjury = parts.Arts * (a.ep_damage_ratio ?? 0);
      note = 'Single lane, zero idle stacks, before overload.';
      break;
    case 'clemnt':
      if (slot === 2) {
        field('Whirlpool tick', 1);
        hit('Physical', s['attack@physical_atk_scale']);
        rawInjury = s['attack@water_element'];
      } else {
        hit('Physical', s['attack@atk_scale']);
        rawInjury = parts.Physical * s['attack@ep_damage_ratio'];
      }
      note = 'Unenhanced hit. Burst-triggered ammunition is a separate event.';
      break;
    case 'cairn':
      field(slot ? 'S2 pulse' : 'Blocked enemy aura', 1);
      injuryAmp *= m.ep_damage_scale ?? 1;
      if (slot) hit('Arts', s.atk_scale);
      rawInjury = atk * (slot ? s.ep_damage_ratio : (a.ep_damage_ratio ?? 0));
      note = 'Target is blocked. S2 pulse and talent aura shown individually.';
      break;
    case 'ela':
      trigger('Grzmot Mine');
      note = 'Applies crowd control or Fragile. The mine itself deals zero HP damage.';
      break;
    case 'rfrost':
    case 'wulfen':
    case 'doroth':
    case 'robin':
      trigger('Trap detonation');
      {
        const target =
          (id === 'doroth' && slot === 1) || (id === 'wulfen' && slot === 2)
            ? { ...t, def: t.def * (1 + s.def) }
            : t;
        parts[id === 'doroth' && slot === 3 ? 'Arts' : 'Physical'] =
          (id === 'wulfen' && slot === 2 ? 2 : 1) *
          mitigate(
            atk * (s.trap_atk_scale ?? s.atk_scale) * (proc ? (m.atk_scale ?? 1) : 1),
            id === 'doroth' && slot === 3 ? 'Arts' : 'Physical',
            target,
          );
      }
      note =
        'One ground target, one trap, owner ATK at placement. No chained explosions or previous trap stacks.';
      if (id === 'rfrost' && slot === 2 && inRange) {
        hit('Physical', s.atk_scale, s.times);
        name = 'Welcome Mat and follow-up shots';
        note =
          'The enemy triggers one trap inside Frost’s attack range. Each follow-up shot applies DEF independently.';
      }
      break;
    case 'svash2':
      trigger('Countergambit cast');
      hit('Physical', s.atk_scale);
      break;
    case 'phatom':
      if (slot === 2) {
        trigger('Bloody Opus opening attack');
        hit('Physical');
        note = 'Full charges on deployment. Each of Phantom’s own attacks spends one charge.';
      } else {
        trigger('Night Raid on deploy');
        hit('Physical', s.atk_scale);
      }
      break;
    default:
      focus = true;
  }
  return focus
    ? null
    : {
        parts,
        injury: locked ? 0 : rawInjury * injuryAmp * Math.max(0.05, 1 - t.injuryRes / 100),
        cadence,
        name,
        note,
      };
}
