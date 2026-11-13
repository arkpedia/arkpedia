import type { D1Database } from '@cloudflare/workers-types';
import type { SupporterSnapshot } from './supporters';
export interface PatreonEnv {
  ARKPEDIA_DEPLOYMENT_ROLE?: string; ARKPEDIA_AUTH_URL?: string; ARKPEDIA_ACCOUNTS_DB: D1Database;
  PATREON_CAMPAIGN_ID?: string; PATREON_CLIENT_ID?: string; PATREON_CLIENT_SECRET?: string;
  PATREON_CREATOR_ACCESS_TOKEN?: string; PATREON_CREATOR_REFRESH_TOKEN?: string;
}
export function patreonConfigured(env: unknown): boolean;
export function sealTokens(tokens: { access: string; refresh: string }, env: PatreonEnv): Promise<string>;
export function openTokens(envelope: string, env: PatreonEnv): Promise<{ access: string; refresh: string }>;
export function supporterSnapshot(tiers: Map<string, { id: string; title: string; amount_cents: number }>, members: Map<string, unknown>, users: Map<string, unknown>, now: number): SupporterSnapshot;
export function readSupporters(env: PatreonEnv): Promise<SupporterSnapshot | null>;
export function syncPatreon(env: PatreonEnv, options?: { fetch?: typeof fetch; now?: number; bootstrapOnly?: boolean }): Promise<{ configured: boolean; skipped?: boolean; updated?: boolean }>;
