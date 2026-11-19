/**
 * Where the reader's tier list is kept: one localStorage key, read and written only here,
 * so a later account upload has one source (CLAUDE.md, "Arkpedia accounts").
 *
 * Not yet in the backup or cloud-save lists (lib/account/backup.ts BACKUP_STORES): joining
 * them is a change to what the account uploads, to be made with the account work.
 */
import { createLocalStore } from './localStore';
import { defaultTierList, parseTierList, type TierListState } from './state';

export const TIER_LIST_KEY = 'arkpedia:tier-list:v1';
export const TIER_LIST_EVENT = 'arkpediaTierListChanged';

const store = createLocalStore<TierListState>(TIER_LIST_KEY, TIER_LIST_EVENT, parseTierList, defaultTierList());

export const writeTierList = store.write;
/** The saved tier list and a reducer-style setter. The default list on the server and in
 *  the first paint, so the markup matches; the saved one arrives right after. */
export const useTierList = store.use;
