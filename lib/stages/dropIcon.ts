import path from 'path';
import itemIcons from '@/data/item-icons.json';
import { publicFileExists, publicFiles } from '@/lib/assets/publicAssets';
import { StageDrop } from './stageTypes';
import { getOperatorByName } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';

/**
 * Item id -> icon path for a stage's drops, or absent when neither set has one.
 *
 * Two sets, because a stage drops two different kinds of thing: materials and
 * tokens come from public/item-icons/ (imported by scripts/import-item-icons.mjs
 * and keyed by gamedata item id, since the file names carry a slug the drop
 * record does not), while a first-clear operator reward is an operator and uses
 * the operator's own portrait.
 *
 * Server-side only -- getOperatorByName reads data/operators-*star/. Call it
 * from getStaticProps and pass the result down, so the operator dataset does not
 * follow the icons into the page payload.
 */
export function getDropIcons(drops: StageDrop[]): Record<string, string> {
  const out: Record<string, string> = {};
  const files = itemIcons as Record<string, string>;
  for (const drop of drops) {
    const item = drop.item;
    if (!item || out[item.id]) continue;
    if (item.is_operator) {
      const icon = operatorIcon(item.name);
      if (icon) out[item.id] = icon;
      continue;
    }
    const file = files[item.id];
    // Furniture and event coins (113 of the 298 items stages drop) have no
    // upstream icon at all; those render the blank frame.
    if (file) out[item.id] = `/item-icons/${file}`;
  }
  return out;
}

/** The operator's portrait, checked against what is actually on disk.
 *
 * getOperatorIconPath builds "<Name> - Base.webp" whether or not the file is
 * there, and these folders are hand-maintained, so the path is verified and the
 * operator's other art accepted in its place rather than served as a 404.
 *
 * There used to be a preference for "<Name> - Default.webp" here, on the
 * grounds that Lancet-2's art was filed under that label. Its ICON never was --
 * only its illustration, in the skins folder -- so the branch could not fire,
 * and "Default" is now gone from the art folders entirely: the planner's
 * getStaticProps fails the build on either label being wrong.
 */
function operatorIcon(name: string): string | null {
  const op = getOperatorByName(name);
  if (!op) return null;
  const built = getOperatorIconPath(op);
  if (publicFileExists(built)) return built;
  const dir = path.dirname(built);
  const prefix = `${path.basename(built).split(' - ')[0]} - `;
  const pick = publicFiles(dir).filter((file) => file.startsWith(prefix)).sort()[0];
  return pick ? `${dir}/${pick}` : null;
}
