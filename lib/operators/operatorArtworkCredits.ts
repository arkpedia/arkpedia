import type { Appearance } from './operatorAppearances';
import type { Operator } from './operatorTypes';
import type { Skin } from '../skins/skinTypes';

export interface ArtworkCredit {
  illustrator: string | null;
  originalDesigner: string | null;
}

function parseCredit(value?: string | null): ArtworkCredit {
  const designer = value?.match(/\s*\(original design by\s+([^)]*)\)/i);
  return {
    illustrator: value?.replace(/\s*\(original design by\s+[^)]*\)/i, '').trim() || null,
    originalDesigner: designer?.[1].trim() || null,
  };
}

function baseArtistBeforeSupplement(names: string, artists: string[]): string | null {
  const lower = names.toLowerCase();
  // The flattened source can put the base and outfit artists before one note:
  // "幻象黑兔 尾鱼 (Midnight Delivery)". Match complete catalogue names so
  // multiword artists such as Studio Montagne are never split on whitespace.
  for (const artist of artists) {
    if (!lower.endsWith(` ${artist.toLowerCase()}`)) continue;
    const base = names.slice(0, -artist.length).trim();
    if (base && !/[,&、]$/.test(base)) return base;
  }
  for (const artist of artists) {
    if (lower.startsWith(`${artist.toLowerCase()} `)) return names.slice(0, artist.length);
  }
  return null;
}

function parseBaseCredit(value: string | undefined, artists: string[]): ArtworkCredit {
  const illustrators: string[] = [];
  let originalDesigner: string | null = null;
  let end = 0;
  for (const match of (value || '').matchAll(/([^()]*)\(([^()]*)\)/g)) {
    const names = match[1].trim();
    const note = match[2].trim();
    const designer = note.match(/^original design by\s+(.+)$/i);
    if (designer) {
      if (names) illustrators.push(names);
      originalDesigner ||= designer[1].trim();
    } else if (/^original design$/i.test(note)) {
      originalDesigner ||= names || null;
    } else if (/^operator(?: art)?$/i.test(note)) {
      if (names) illustrators.push(names);
    } else if (/^(credited as\b|additional design by\b|with additional art by\b)/i.test(note)) {
      if (names) illustrators.push(`${names} (${note})`);
    } else if (!/^enemy$/i.test(note) && !illustrators.length) {
      const base = baseArtistBeforeSupplement(names, artists);
      if (base) illustrators.push(base);
    }
    end = match.index! + match[0].length;
  }
  const remaining = value?.slice(end).trim();
  if (remaining) illustrators.push(remaining);
  return { illustrator: [...new Set(illustrators)].join(', ') || null, originalDesigner };
}

export function getOperatorArtworkCredits(
  operator: Pick<Operator, 'name' | 'characterInfo'>,
  appearances: Pick<Appearance, 'label' | 'fullPath'>[],
  skins: Pick<Skin, 'model' | 'name' | 'image' | 'illustrator'>[],
): Record<string, ArtworkCredit> {
  const artists = [...new Set(skins.flatMap(skin => {
    const name = skin.illustrator?.replace(/\([^)]*\)/g, '').trim();
    return name ? [name, ...name.split(/\s*[,、&]\s*/)] : [];
  }))].filter(Boolean).sort((a, b) => b.length - a.length);
  const base = parseBaseCredit(operator.characterInfo?.Illustrator, artists);
  const operatorSkins = skins.filter(skin => skin.model === operator.name);
  return { Base: base, ...Object.fromEntries(appearances.map(appearance => {
    // Appearance URLs encode filenames; skin.image is the resolved, raw asset path.
    // Matching that path also handles outfit names with filename-unsafe punctuation.
    const image = appearance.fullPath ? decodeURIComponent(appearance.fullPath) : null;
    const skin = operatorSkins.find(skin => skin.name === appearance.label
      || Boolean(image && skin.image === image));
    const isDefault = /^(base|elite\s*\d+)$/i.test(appearance.label);
    const credit = skin ? parseCredit(skin.illustrator) : isDefault ? base : parseCredit(null);
    return [appearance.label, {
      illustrator: credit.illustrator,
      originalDesigner: base.originalDesigner || credit.originalDesigner,
    }];
  })) };
}
