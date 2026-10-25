import type { ChibiFacings } from './chibi';
import type { Summon } from './summonStats';

interface OperatorExtras {
  chibis?: Record<string, ChibiFacings>;
  summons?: Summon[];
  epTrack?: { id: string; title: string; copyright: boolean } | null;
}

/** Published props are authoritative. Load historical backfills only when missing:
 * Worker bundles deliberately omit those build-time source tables. */
export async function completeOperatorExtras<P extends OperatorExtras>(page: P, load: {
  chibis: () => Promise<NonNullable<OperatorExtras['chibis']>>;
  summons: () => Promise<NonNullable<OperatorExtras['summons']>>;
  epTrack: () => Promise<Exclude<OperatorExtras['epTrack'], undefined>>;
}) {
  const chibis = page.chibis ?? await load.chibis();
  const summons = page.summons ?? await load.summons();
  const epTrack = page.epTrack === undefined ? await load.epTrack() : page.epTrack;
  return { ...page, chibis, summons, epTrack };
}
