export interface ChibiAnimation { name: string; duration: number }
export type ChibiActivity = 'sit' | 'sleep' | 'idle' | 'special' | 'tap' | 'trust-tap' | 'animation' | 'walking';
export interface ChibiBreak { activity: ChibiActivity; clip: string; duration: number; once?: boolean }

/** Building models use Relax/Interact; battle-only fallbacks may have Idle/Special. */
export function chibiActivities(animations: readonly ChibiAnimation[]) {
  const find = (pattern: RegExp) => animations.filter(pose => pose.duration > 0 && pattern.test(pose.name));
  return {
    sit: find(/^sit(?:[_\d].*)?$/i),
    sleep: find(/^sleep(?:[_\d].*)?$/i),
    idle: find(/^(?:relax|idle)(?:[_\d].*)?$/i),
    special: find(/^(?:interact|special)(?:[_\d].*)?$/i),
  };
}

/** Default is a static setup pose in base models; Relax is their normal idle loop. */
export function chibiIdleAnimation(animations: readonly ChibiAnimation[]): string | undefined {
  const idle = chibiActivities(animations).idle;
  return (idle.find(pose => /^idle$/i.test(pose.name))
    ?? idle.find(pose => /^relax$/i.test(pose.name)) ?? idle[0])?.name;
}

/** Native base models use Interact for a tap and Special for an outfit's trust reaction.
 * Models with only one reaction share it; never substitute a static or battle pose. */
export function chooseChibiTap(animations: readonly ChibiAnimation[], firstTap: boolean, random = Math.random): ChibiBreak | null {
  const find = (name: string) => animations.find(pose => pose.duration > 0 && pose.name.toLowerCase() === name.toLowerCase())
    ?? animations.find(pose => pose.duration > 0 && new RegExp(`^${name}[_\\d]`, 'i').test(pose.name));
  const normal = find('Interact'), trust = find('Special');
  if (!normal && !trust) return null;
  const trustTap = firstTap || random() < .5;
  const chosen = (trustTap ? trust ?? normal : normal ?? trust)!;
  return { activity: trustTap ? 'trust-tap' : 'tap', clip: chosen.name, duration: chosen.duration * 1000 };
}

export const isChibiTap = (activity?: ChibiActivity) => activity === 'tap' || activity === 'trust-tap';

/** At a walking destination, sometimes take a break using an actual available pose. */
export function chooseChibiBreak(animations: readonly ChibiAnimation[], random = Math.random): ChibiBreak | null {
  if (random() >= .4) return null;
  const supported = Object.entries(chibiActivities(animations)).filter(([, values]) => values.length);
  if (!supported.length) return null;
  const [activity, choices] = supported[Math.min(supported.length - 1, Math.floor(random() * supported.length))];
  const chosen = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  const duration = activity === 'sit' ? 3000 + random() * 7000
    : activity === 'sleep' ? 10000 + random() * 10000
    : activity === 'idle' ? Math.max(chosen.duration * 1000, 2000 + random() * 4000) : Math.max(500, chosen.duration * 1000);
  return { activity: activity as ChibiActivity, clip: chosen.name, duration };
}

// Unmodified game-client furniture renders, pinned to the same reviewed dump used by event art.
// The UI clips their baked catalogue backdrop around the furniture silhouette.
const furnitureRoot = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/404cf368572a4f346f66614612c40fd7779012b5/assets/dyn/arts/ui/furnitureicons/';
export const CHIBI_FURNITURE = {
  sit: { name: 'Black Retro Chair', image: furnitureRoot + 's2_01/furni_s2_chair_l_01.png', id: 'furni_s2_chair_L_01' },
  sleep: { name: 'Porcelain Bed', image: furnitureRoot + 's1_01/furni_s1_bed_01.png', id: 'furni_s1_bed_01' },
} as const;
