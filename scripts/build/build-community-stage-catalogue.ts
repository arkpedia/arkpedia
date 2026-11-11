import fs from 'node:fs';
import { getStageSlugs, getStageBySlug, getStagePreviewFile } from '../../lib/stages/stages';

// API imports need this compact catalogue before tests, independently of the
// much larger stage-detail/pathfinding build that runs later in prebuild.
const stages = getStageSlugs().flatMap(slug => {
  const stage = getStageBySlug(slug);
  return stage?.id ? [{ id: stage.id, slug: stage.slug, code: stage.code ?? stage.slug,
    name: stage.name ?? stage.code ?? stage.slug, image: getStagePreviewFile(stage) }] : [];
});
fs.writeFileSync('data/community-stage-catalogue.json', JSON.stringify(stages));
