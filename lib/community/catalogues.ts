import { readShippedTable } from '@/lib/content/shippedTable';
import type { RosterMetadata } from '@/lib/operators/rosterSort';

type Operators = (Omit<typeof import('@/data/community-operator-catalogue.json')[number], 'roster'> & { roster?: RosterMetadata })[];
type Stages = typeof import('@/data/community-stage-catalogue.json');
type Poll = typeof import('@/data/community-poll-catalogue.json');
type TierList = import('@/lib/tier-list/catalogue').TierCatalogue;
type Account = typeof import('@/data/account-catalogue.json');

// Keep public catalogues in ASSETS, outside the code every cold isolate loads.
// The explicit build constant drops the ordinary JSON imports in Worker builds.
export const communityOperators = async ():Promise<Operators> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<Operators>('community-operator-catalogue.json')
  : (await import('@/data/community-operator-catalogue.json')).default as Operators;
export const communityStages = async ():Promise<Stages> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<Stages>('community-stage-catalogue.json')
  : (await import('@/data/community-stage-catalogue.json')).default;
export const communityPoll = async ():Promise<Poll> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<Poll>('community-poll-catalogue.json')
  : (await import('@/data/community-poll-catalogue.json')).default;
export const accountCatalogue = async ():Promise<Account> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<Account>('account-catalogue.json')
  : (await import('@/data/account-catalogue.json')).default;
export const tierListCatalogue = async ():Promise<TierList> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<TierList>('tier-list-catalogue.json')
  : (await import('@/data/tier-list-catalogue.json')).default as TierList;
