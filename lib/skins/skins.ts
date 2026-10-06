import skinsData from '@/data/skins.json';
import { Skin } from './skinTypes';
import { getAllOperators } from '@/lib/operators/operators';
import { publicFileExists, publicFiles } from '@/lib/assets/publicAssets';

// Same convention as lib/operators/operatorAppearances.ts -- images now
// live in six rarity-specific folders (one-star-skins .. six-star-skins),
// named "{Operator} - {Skin}.webp", rather than the old flat
// /skin-images/ folder. Base and Elite 2 illustrations live in those same
// folders but are never looked up here, since we only ever build
// filenames from skins.json's own skin names -- they simply never come up.
const RARITY_WORDS: Record<number, string> = {
  6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one',
};

function readFolder(dir: string): Set<string> {
  return new Set(publicFiles(dir));
}

// Cache each rarity folder's file listing so a 475-skin dataset only
// costs 6 readdirSync calls total, not 475.
const folderCache = new Map<string, Set<string>>();
function filesForWord(word: string): Set<string> {
  if (!folderCache.has(word)) {
    folderCache.set(word, readFolder(`${word}-star-skins`));
  }
  return folderCache.get(word)!;
}

// A skin's official name can contain characters that can't survive as
// literal filename characters -- straight/curly quotes and "/" being
// the two seen in practice (e.g. Surtr's "Liberté//Échec", Aciddrop's
// '"Afternoon Teatime"'). The actual files just have those characters
// dropped entirely rather than substituted, so we try progressively
// stripped-down variants of the expected filename before giving up.
function stripUnsafeChars(s: string): string {
  return s.replace(/["'\u2018\u2019\u201c\u201d/]/g, '');
}

function resolveImage(word: string, model: string, name: string): string | null {
  const files = filesForWord(word);
  const exact = `${model} - ${name}.webp`;
  if (files.has(exact)) return `/${word}-star-skins/${exact}`;

  const stripped = `${stripUnsafeChars(model)} - ${stripUnsafeChars(name)}.webp`;
  if (stripped !== exact && files.has(stripped)) return `/${word}-star-skins/${stripped}`;

  return null;
}

/**
 * An outfit's art: its operator's rarity folder first, else whichever of the six holds a file of
 * that name (the file is named after the operator, so at most one does). Not knowing the rarity
 * is the normal case on Vercel for a page the content release does not publish yet: the
 * operator records are read from data/, which its functions do not carry, and every outfit
 * there came out "Artwork unavailable" (the Skin Planner, 2026-10-02). The file index is
 * compiled in (lib/assets/publicAssets.ts), so this needs nothing on disk.
 */
export function skinImagePath(model: string, name: string, rarity: number | null): string | null {
  const first = rarity != null ? RARITY_WORDS[rarity] : undefined;
  for (const word of [...(first ? [first] : []), ...Object.values(RARITY_WORDS).filter((w) => w !== first)]) {
    const image = resolveImage(word, model, name);
    if (image) return image;
  }
  return null;
}

export function getAllSkins(): Skin[] {
  const raw = skinsData as Skin[];

  const rarityByOperatorName = new Map<string, number | null>();
  for (const op of getAllOperators()) {
    rarityByOperatorName.set(op.name, op.rarity ?? null);
  }

  return raw.map((skin) => {
    if (skin.image?.startsWith('https://raw.githubusercontent.com/')) return skin;
    if (!skin.model) return { ...skin, image: null };

    // New catalogue entries already carry their verified rarity-specific asset
    // path. Prefer that published path so future and crossover outfits do not
    // depend on an operator record having landed in the same content release.
    if (skin.image && publicFileExists(skin.image)) return skin;

    /* Amiya's Guard and Medic forms used to be hardcoded to 5 here, because the skins
       data names the FORM as the model while the operator files knew one Amiya. They are
       real operator records now (scripts/build/build-amiya-forms.mjs), so their rarity comes
       from the same place as everyone else's and the warning below is free to mean what
       it says: a model with no operator behind it. */
    const image = skinImagePath(skin.model, skin.name, rarityByOperatorName.get(skin.model) ?? null);
    if (!image) console.warn(`[skins] no image file found for "${skin.model} - ${skin.name}.webp" (or a quote/slash-stripped variant) in any rarity's skins folder`);
    return { ...skin, image };
  });
}
