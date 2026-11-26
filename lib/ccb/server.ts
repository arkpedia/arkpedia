import fs from 'node:fs';
import path from 'node:path';
import { getStageBySlug, getStageEnemyDetails, getStageGeometryFor, getStagePreviewFile } from '@/lib/stages/stages';
import { getEnemyBundles } from '@/lib/enemies/enemies';
import type { BattleplanSeason, MapDetails } from './types';

export const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config/ccb-archive.json'), 'utf8')) as { source: string; seasons: BattleplanSeason[] };
export function mapDetails(stageId: string): MapDetails | null {
  const stage = getStageBySlug(stageId);
  if (!stage) return null;
  const geometry = getStageGeometryFor(stage).geometry;
  const details = getStageEnemyDetails(stage, geometry);
  const enemies = getEnemyBundles().flatMap(bundle => bundle.enemies);
  let conditional: { enemy_id: string; condition?: { hidden_group?: string } }[] = [];
  try { conditional = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/stage-conditional', `${stageId}.json`), 'utf8')); } catch { /* No conditional spawns. */ }
  const mainSlugs = new Set(Object.values(stage.enemies?.by_rank ?? {}).flat().map(row => row.slug));
  const preview = getStagePreviewFile(stage);
  return {
    preview: preview ? `/stages-images/${preview}` : null,
    variants: (geometry?.enemyConfigurations ?? []).flatMap(config => {
      const enemy = enemies.find(row => row.id === config.enemy_id);
      const stats = enemy?.levels.find(row => row.level === config.database_level)?.stats;
      const stat = (key: string) => config.overrides?.[key] ?? (stats as unknown as Record<string, number | null> | undefined)?.[key] ?? null;
      if (!stats && !config.overrides) return [];
      return [{ id: config.enemy_id, slug: config.slug ?? config.enemy_id, name: config.name ?? enemy?.name ?? config.enemy_id, icon: enemy?.icon ?? null, conditional: true, hiddenGroups: [], stats: { hp: stat('hp'), atk: stat('atk'), def: stat('def'), res: stat('res'), interval: stat('attack_interval'), aspd: stat('attack_speed') ?? 100, moveSpeed: stat('move_speed'), weight: stat('weight'), physicalTaken: 100, artsTaken: 100 } }];
    }),
    battle: { life: stage.battle?.max_life ?? null, deployment: stage.battle?.unit_limit ?? null, initialDp: stage.battle?.initial_dp ?? null, dpRecovery: stage.battle?.dp_per_second ?? null },
    enemies: Object.values(details).map(detail => {
      const enemy = enemies.find(row => row.slug === detail.slug)!;
      const config = geometry?.enemyConfigurations.find(row => row.slug === detail.slug);
      const stats = enemy.levels.find(row => row.level === detail.level)?.stats;
      return {
        id: enemy.id, slug: detail.slug, name: detail.name, icon: detail.icon,
        conditional: !mainSlugs.has(detail.slug),
        hiddenGroups: conditional.filter(row => row.enemy_id === enemy.id).flatMap(row => row.condition?.hidden_group ? [row.condition.hidden_group] : []),
        stats: { hp: detail.stats?.hp ?? null, atk: detail.stats?.atk ?? null, def: detail.stats?.def ?? null, res: detail.stats?.res ?? null, interval: detail.stats?.attackInterval ?? null, aspd: config?.overrides?.attack_speed ?? stats?.attack_speed ?? 100, moveSpeed: detail.moveSpeed, weight: config?.overrides?.weight ?? stats?.weight ?? null, physicalTaken: 100, artsTaken: 100 },
      };
    }),
  };
}
