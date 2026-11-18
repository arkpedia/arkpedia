import type { HTMLAttributes } from 'react';
import { ApplicationArt, ApplicationImage, type ApplicationAsset } from '@/components/content/ContentImage';
import gameArt from '@/config/is-game-art.json';

/*
 * Contingency Contract interface art from the game, published in arkpedia-image-assets
 * under content-art/contingency-contract/ (its sync keeps Global ahead of CN) and pinned
 * with the Integrated Strategies art in config/is-game-art.json.
 */
const ROOT = 'content-art/contingency-contract';
const asset = (folder: string, id: string): ApplicationAsset => ({ repository: 'arkpedia-image-assets', revision: gameArt.revision, path: `${ROOT}/${folder}/${id}.webp` });

/** A one-colour game glyph (contract icon or region logo), painted in the surrounding ink. */
export function CcbGlyph({ kind, id, className, ...props }: HTMLAttributes<HTMLSpanElement> & { kind: 'runeicon' | 'stagelogo'; id: string }) {
  return <ApplicationArt {...props} asset={asset(kind, id)} className={`mode-mark${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}

/** The soft-edged area picture the game shows behind a battlefield (256x183 in the game files). */
export function CcbArea({ id, className }: { id: string; className?: string }) {
  return <ApplicationImage asset={asset('mapareabg', id)} alt="" width={512} height={366} className={className} />;
}

/** A season's shop banner, for seasons the content release has no wide banner for. */
export function CcbSeasonBanner({ id }: { id: string }) {
  return <ApplicationImage asset={asset('shopseasonback', id)} alt="" width={160} height={90} />;
}
