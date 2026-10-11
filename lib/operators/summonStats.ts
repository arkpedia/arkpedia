export interface Summon { id: string; name: string; phases: { maxLevel: number; frames: { level: number; stats: Record<string, number> }[] }[] }
export function summonStats(summon: Summon, elite: number, level: number) {
  const phase = summon.phases[Math.min(elite, summon.phases.length - 1)];
  if (!phase) return {};
  const frames = [...phase.frames].sort((a, b) => a.level - b.level);
  const clamped = Math.max(1, Math.min(phase.maxLevel, level));
  const before = [...frames].reverse().find(frame => frame.level <= clamped) ?? frames[0];
  const after = frames.find(frame => frame.level >= clamped) ?? frames[frames.length - 1];
  const ratio = after.level === before.level ? 0 : (clamped - before.level) / (after.level - before.level);
  return Object.fromEntries(Object.keys(before.stats).map(key => [key, before.stats[key] + ratio * (after.stats[key] - before.stats[key])]));
}
