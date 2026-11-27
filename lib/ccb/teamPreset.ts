import { boundedInt } from '@/lib/planner/untrusted';

export const TEAM_LIMIT = 13;
export const TEAM_PRESET_KEY = 'arkpediaCcbTeamPreset';

export interface TeamBuild {
  elite: number;
  level: number;
  potential: number;
  trust: number;
  moduleIndex: number;
  moduleStage: number;
  tile: 'ground' | 'high' | null;
  elapsed: number;
}

export interface TeamPresetMember {
  name: string;
  build: TeamBuild;
  moduleId?: string;
}

function parseBuild(value: unknown): TeamBuild | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<keyof TeamBuild, unknown>;
  const elite = boundedInt(input.elite, 0, 2);
  const level = boundedInt(input.level, 1, 90);
  const potential = boundedInt(input.potential, 1, 6);
  const trust = boundedInt(input.trust, 0, 200);
  const moduleIndex = boundedInt(input.moduleIndex, -1, 15);
  const moduleStage = boundedInt(input.moduleStage, 0, 2);
  const elapsed = boundedInt(input.elapsed, 0, 9999);
  if (elite === null || level === null || potential === null || trust === null || moduleIndex === null || moduleStage === null || elapsed === null) return null;
  const tile = input.tile === 'ground' || input.tile === 'high' ? input.tile : null;
  return { elite, level, potential, trust, moduleIndex, moduleStage, tile, elapsed };
}

export function parseTeamPreset(raw: string | null, operators: readonly string[]): TeamPresetMember[] {
  if (!raw || raw.length > 8192) return [];
  try {
    const preset = JSON.parse(raw) as { version?: unknown; members?: unknown } | null;
    if (preset?.version !== 1 || !Array.isArray(preset.members)) return [];
    const available = new Set(operators);
    const members: TeamPresetMember[] = [];
    for (const row of preset.members) {
      if (typeof row?.name !== 'string' || !available.has(row.name)) continue;
      const build = parseBuild(row.build);
      if (!build) continue;
      available.delete(row.name);
      const moduleId = typeof row.moduleId === 'string' && row.moduleId.length <= 128 ? row.moduleId : undefined;
      members.push({ name: row.name, build, moduleId });
      if (members.length === TEAM_LIMIT) break;
    }
    return members;
  } catch {
    return [];
  }
}

export function serializeTeamPreset(members: TeamPresetMember[]): string {
  return JSON.stringify({ version: 1, members });
}
