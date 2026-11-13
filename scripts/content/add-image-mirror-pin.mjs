import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function withRevision(plan, revision, repository, label) {
  if (!Array.isArray(plan)) throw new Error('Expected an array of immutable mirror pins');
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Expected a full ${label} repository commit`);
  return plan.some(pin => pin.repository === repository && pin.revision === revision)
    ? plan : [...plan, { repository, revision }];
}
export const withImageRevision = (plan, revision) => withRevision(plan, revision, 'arkpedia-image-assets', 'image');
export const withAnimationRevision = (plan, revision) => withRevision(plan, revision, 'arkpedia-l2d-assets', 'animation');

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  const original = JSON.parse(await readFile(path, 'utf8'));
  const plan = process.env.ANIMATION_REVISION
    ? withAnimationRevision(original, process.env.ANIMATION_REVISION)
    : withImageRevision(original, process.env.IMAGE_REVISION);
  await writeFile(path, JSON.stringify(plan, null, 2) + '\n');
}
