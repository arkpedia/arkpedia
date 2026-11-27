import { deflateSync, inflateSync } from 'fflate';
import { normalizeUsername } from '@/lib/cloud-account/profile';
import { parseTeamMember, parseTeamPreset, TEAM_PRESET_KEY, type TeamPresetMember } from './teamPreset';
import { toggleContract } from './modifiers';
import type { BattleplanSeason } from './types';

export const CCB_PRESETS_KEY = 'arkpediaCcbPresets';
export const PRESET_NAME_LENGTH = 60;
const CODE_PREFIX = 'ccb1.';
export const PRESET_CODE_LENGTH = 256 * 1024;
const MAX_PRESET_BYTES = 256 * 1024;

export interface PresetRisks {
  seasonId: string;
  mapId: string;
  contracts: string[];
}

export type PresetContents =
  | { risks: PresetRisks; operators?: never }
  | { risks?: never; operators: TeamPresetMember[] }
  | { risks: PresetRisks; operators: TeamPresetMember[] };

export type CcbPreset = PresetContents & { name: string; creator?: string };
export type SavedCcbPreset = CcbPreset & { id: string; imported?: boolean };

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

export function parseCcbPreset(value: unknown): CcbPreset {
  if (!value || typeof value !== 'object') throw new Error('The preset is missing.');
  const input = value as Partial<Record<keyof CcbPreset, unknown>>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > PRESET_NAME_LENGTH || /\p{Cc}/u.test(name)) {
    throw new Error(`Use a preset name of 1–${PRESET_NAME_LENGTH} characters.`);
  }
  const creator = input.creator === undefined ? undefined : normalizeUsername(input.creator).username;
  let risks: PresetRisks | undefined;
  if (input.risks !== undefined) {
    const fields = input.risks as Partial<Record<keyof PresetRisks, unknown>> | null;
    if (!isId(fields?.seasonId) || !isId(fields.mapId) || !Array.isArray(fields.contracts) ||
      !fields.contracts.every(isId) || new Set(fields.contracts).size !== fields.contracts.length) {
      throw new Error('The preset has invalid risk data.');
    }
    risks = { seasonId: fields.seasonId, mapId: fields.mapId, contracts: fields.contracts };
  }
  let operators: TeamPresetMember[] | undefined;
  if (input.operators !== undefined) {
    if (!Array.isArray(input.operators) || !input.operators.length) throw new Error('The preset is missing its operators.');
    operators = [];
    const seen = new Set<string>();
    for (const row of input.operators) {
      const member = parseTeamMember(row);
      if (!member || seen.has(member.name)) throw new Error('The preset has invalid operator builds.');
      seen.add(member.name);
      operators.push(member);
    }
  }
  if (risks && operators) return { name, creator, risks, operators };
  if (risks) return { name, creator, risks };
  if (operators) return { name, creator, operators };
  throw new Error('The preset is missing risks and operators.');
}

export function encodeCcbPreset(preset: CcbPreset): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parseCcbPreset(preset)));
  if (bytes.length > MAX_PRESET_BYTES) throw new Error('This preset is too large to share.');
  const packed = deflateSync(bytes);
  let binary = '';
  for (const byte of packed) binary += String.fromCharCode(byte);
  const code = CODE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (code.length > PRESET_CODE_LENGTH) throw new Error('This preset is too large to share.');
  return code;
}

export function decodeCcbPreset(raw: string): CcbPreset {
  const code = raw.trim();
  const body = code.slice(CODE_PREFIX.length);
  if (code.length > PRESET_CODE_LENGTH || !code.startsWith(CODE_PREFIX) || !/^[\w-]+$/.test(body)) {
    throw new Error('Enter a valid CCB preset code.');
  }
  try {
    const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    // A fixed output buffer bounds decompression even for a crafted code.
    const bytes = inflateSync(Uint8Array.from(binary, char => char.charCodeAt(0)), { out: new Uint8Array(MAX_PRESET_BYTES + 1) });
    if (bytes.length > MAX_PRESET_BYTES) throw new Error('Preset is too large.');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return parseCcbPreset(JSON.parse(json));
  } catch {
    throw new Error('This CCB preset code is incomplete or invalid.');
  }
}

export function validatePresetContents(preset: CcbPreset, seasons: BattleplanSeason[], availableOperators: readonly string[]) {
  if (preset.risks) {
    const { seasonId, mapId, contracts } = preset.risks;
    const map = seasons.find(season => season.id === seasonId)?.maps.find(site => site.id === mapId);
    if (!map) throw new Error('This preset’s battlefield is unavailable.');
    const all = map.groups.flatMap(group => group.contracts);
    let selected: string[] = [];
    for (const id of contracts) {
      const contract = all.find(row => row.id === id);
      if (!contract) throw new Error('This preset contains a contract that is unavailable.');
      selected = toggleContract(selected, contract, all);
    }
    if (selected.length !== contracts.length) throw new Error('This preset contains conflicting contracts.');
  }
  if (preset.operators) {
    const catalogue = new Set(availableOperators);
    const missing = preset.operators.find(member => !catalogue.has(member.name));
    if (missing) throw new Error(`${missing.name} is unavailable in this operator catalogue.`);
  }
}

export function readCcbPresets(storage: Pick<Storage, 'getItem'>, operators: readonly string[]): SavedCcbPreset[] {
  const raw = storage.getItem(CCB_PRESETS_KEY);
  if (raw === null) {
    const legacy = parseTeamPreset(storage.getItem(TEAM_PRESET_KEY), operators);
    return legacy.length ? [{ id: 'legacy-team', name: 'Saved team', operators: legacy }] : [];
  }
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.presets)) throw new Error('Saved presets could not be read.');
  const ids = new Set<string>();
  return data.presets.map((value: unknown) => {
    const preset = parseCcbPreset(value);
    const { id, imported } = value as Partial<SavedCcbPreset>;
    if (!isId(id) || ids.has(id)) throw new Error('Saved presets could not be read.');
    ids.add(id);
    return { ...preset, id, imported: imported === true };
  });
}

export function writeCcbPresets(storage: Pick<Storage, 'setItem'>, presets: SavedCcbPreset[]) {
  // Keep the legacy slot intact. Once this list exists it owns the saved presets.
  storage.setItem(CCB_PRESETS_KEY, JSON.stringify({ version: 1, presets }));
}
