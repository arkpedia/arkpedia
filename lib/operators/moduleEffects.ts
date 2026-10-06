import type { OperatorModule } from './operatorTypes';

export interface ActiveModuleEffect {
  label: string;
  text: string;
}

function effectKey(label: string) {
  // A newly added talent keeps its identity when later stages improve it.
  const name = label.trim().replace(/^new talent\s*:\s*/i, '').replace(/\s+(?:improved|upgraded)$/i, '').toLowerCase();
  return /^(?:new )?trait$/.test(name) ? 'trait' : name;
}

/* A stage that changes two things at once (Dorothy TRP-X Stage 1: the trait and a talent) keeps
   one label per line, joined with " · " (scripts/sync/module-stages.mjs). Split only when the
   counts agree, since a single effect's text can itself run over several lines. */
function stageEffects(label: string, text: string): ActiveModuleEffect[] {
  const labels = label.split(' · ');
  const lines = text.split('\n');
  if (labels.length > 1 && labels.length === lines.length) return labels.map((l, i) => ({ label: l, text: lines[i] }));
  return [{ label, text }];
}

/** Derive the active effects without copying inherited descriptions into data.
 * Stage stat bonuses are absolute values and must not be accumulated here. */
export function getModuleStageEffects(module: Pick<OperatorModule, 'stages'>, stageIndex: number): ActiveModuleEffect[] {
  const effects = new Map<string, ActiveModuleEffect>();
  const labels = module.stages.map(stage => stage.effectLabel?.trim());
  for (const [index, stage] of module.stages.entries()) {
    if (index > stageIndex) break;
    if (!stage.effectText?.trim()) continue;
    // Some older records omit the middle stage's label. Use its named upgrade
    // instead of hiding its text or retaining both versions at Stage 3.
    const label = labels[index] || labels.slice(index + 1).find(Boolean) || (index === 0 ? 'Trait' : 'Talent upgrade');
    for (const effect of stageEffects(label, stage.effectText)) effects.set(effectKey(effect.label), effect);
  }
  return [...effects.values()].filter((effect, index, all) => all.findIndex(other => other.text === effect.text) === index);
}
