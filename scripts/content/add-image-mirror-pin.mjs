import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function withImageRevision(plan, revision) {
  if (!Array.isArray(plan)) throw new Error('Expected an array of immutable mirror pins');
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Expected a full image repository commit');
  const repository = 'arkpedia-image-assets';
  return plan.some(pin => pin.repository === repository && pin.revision === revision)
    ? plan : [...plan, { repository, revision }];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  const plan = withImageRevision(JSON.parse(await readFile(path, 'utf8')), process.env.IMAGE_REVISION);
  await writeFile(path, JSON.stringify(plan, null, 2) + '\n');
}
