import { Operator } from './operatorTypes';

const RARITY_WORDS: Record<number, string> = {
  6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one',
};

/**
 * What an operator shows while the image repository has no portrait for it: the
 * site's own mark, which is in arkpedia-image-assets (essential-icons/Arkpedia.webp,
 * listed in its asset-manifest.json) and reads on both themes. It replaced
 * /future_operator_icons/<name>.webp, a folder with no redirect and no files, which
 * rendered every such operator as a broken image.
 */
export const OPERATOR_PORTRAIT_PLACEHOLDER = '/essential-icons/Arkpedia.webp';

/** The roster portrait an operator's record names, relative to the image repository. */
export function operatorPortraitFile(op: Pick<Operator, 'name' | 'rarity'>): string {
  const word = (op.rarity && RARITY_WORDS[op.rarity]) || 'six';
  return `${word}-star-icons/${op.name.replace(/[\\/*?:"<>|]/g, '').trim()} - Base.webp`;
}

/**
 * Returns the icon path for an operator: its rarity portrait, or the placeholder
 * while that portrait is unpublished. Pure function, no Node APIs and no asset
 * index -- safe to call from client-rendered components as well as server-side code.
 * Encode the filename for Next image optimization, retaining accents and apostrophes.
 *
 * Whether the portrait exists is decided on the server, against the content
 * release's asset index (lib/operators/operatorPortrait.ts), and travels with the
 * record as `portraitPending`. It used to be looked up here, in the browser, in the
 * index the last deploy compiled into a 453 KB chunk, so art a release had already
 * published stayed missing until a redeploy.
 */
export function getOperatorIconPath(op: Pick<Operator, 'name' | 'rarity' | 'portraitPending'>): string {
  if (op.portraitPending) return OPERATOR_PORTRAIT_PLACEHOLDER;
  const file = operatorPortraitFile(op);
  const split = file.indexOf('/');
  return `/${file.slice(0, split)}/${encodeURIComponent(file.slice(split + 1))}`;
}
