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
    effects.set(effectKey(label), { label, text: stage.effectText });
  }
  return [...effects.values()].filter((effect, index, all) => all.findIndex(other => other.text === effect.text) === index);
}
