import { publicFileExists } from '@/lib/assets/publicAssets';
import { operatorPortraitFile } from './operatorIcon';
import type { Operator } from './operatorTypes';

/*
 * SERVER ONLY: reads the asset index, which the content release rebuilds for the asset
 * commits it pins (npm run assets:update, the 'asset-revisions' stage). The export
 * resolves every operator here, so a portrait published after the last deploy shows as
 * soon as a release pins it, and the browser never loads the index.
 */

/** True while the image repository has not published the operator's roster portrait.
 *  Full portraits can arrive months before a Global release, so this asks the index
 *  rather than the release flags. */
export function isPortraitPending(op: Pick<Operator, 'name' | 'rarity'>): boolean {
  return !publicFileExists(operatorPortraitFile(op));
}

/** The compact form every projection spreads in: present only when true, like isFuture. */
export function portraitStatus(op: Pick<Operator, 'portraitPending'>): { portraitPending?: true } {
  return op.portraitPending ? { portraitPending: true } : {};
}
