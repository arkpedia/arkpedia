import { isIcon, isKeyArt, isNodeIcon, type IsArt, type IsKeyArt } from './isArt';
/** Public, bounded IS records. Global overrides the same CN record by identity. */
export interface IsRecord { id: string; name: string; text: string; source: 'Global' | 'CN'; type?: string; href?: string; image?: string; imageKind?: 'art' | 'mask' | 'map';
  /** Items: the reader-facing group the record is listed under. */ category?: IsItemCategory;
  /** Coins: the game's icon group (one icon per coin, shared by all its gilded variants). */ coin?: string;
  /** Endings: the ending's story picture. */ cg?: string;
  /** Squads: every effect a random-effect squad can roll. */ variants?: { text: string }[];
  /** Squads: an upgraded form of another squad. */ upgraded?: boolean;
  /** Squads and endings: how the game says it is unlocked or reached. */ unlock?: string;
  /** Endings: position in the game's own order, from 1. */ number?: number;
  /** Endings: how to reach it. Editorial: the game tables do not record this. */ requirements?: IsEndingRequirements }
export interface IsEndingRequirements { needs?: string; avoid?: string[]; steps: string[] }
export type IsItemCategory = 'collectibles' | 'coins' | 'vouchers' | 'other';
const CATEGORY: Record<string, IsItemCategory> = { RELIC: 'collectibles', COPPER: 'coins', RECRUIT_TICKET: 'vouchers', UPGRADE_TICKET: 'vouchers', CUSTOM_TICKET: 'vouchers' };
/** Counters and per-variant duplicates the game stores as items but never lists as ones. */
const HIDDEN_ITEMS = new Set(['COPPER_BUFF', 'COPPER_DRAW_NUM', 'STASH_RECRUIT_LIMIT', 'HPMAX', 'SQUAD_CAPACITY', 'SPECIAL_ZONE_AP']);
export interface IsTopic { id: string; name: string; intro: string; source: 'Global' | 'CN'; sections: Record<string, IsRecord[]>; resources?: IsRecord[]; tabIcons?: Record<string, string>; keyArt?: IsKeyArt;
  /** Art folders the CDN stores under another revision than the pin (unchanged files are stored once, under the revision that introduced them): folder -> revision. */ stored?: Record<string, string> }
type Row = Record<string, unknown>;
type Table = { topics?: Record<string, Row>; details?: Record<string, Row>; modules?: Record<string, unknown> };
const rows = (value: unknown): Row[] => value && typeof value === 'object' ? Object.values(value).filter((v): v is Row => !!v && typeof v === 'object') : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
function record(row: Row, source: 'Global' | 'CN', fallback: string, art?: IsArt, topic = ''): IsRecord {
  const image = isIcon(art, topic, row.iconId || row.displayIconId || rows(row.icons).at(-1)?.iconId);
  return { ...(image ? { image, imageKind: /\/(?:topics|outerbufficon)\//.test(image) ? 'mask' as const : 'art' as const } : {}), id: text(row.id) || fallback, name: text(row.name) || text(row.title) || fallback, text: [...new Set(['usage', 'description', 'functionDesc', 'ruleDesc', 'desc', 'unlockCondDesc'].map(k => text(row[k])).filter(Boolean))].join('\n\n'), source, ...(row.type ? { type: text(row.type) } : {}) };
}
function mechanics(value: unknown, source: 'Global' | 'CN', path = '', art?: IsArt, topic = ''): IsRecord[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Row;
  if ((row.name || row.title) && ['description', 'functionDesc', 'ruleDesc', 'desc', 'usage'].some(k => text(row[k]))) return [record(row, source, path, art, topic)];
  return Object.entries(row).flatMap(([key, child]) => mechanics(child, source, `${path}/${key}`, art, topic));
}
export function projectIs(cn: Table, global: Table, stages: { id: string; slug: string; image?: string }[] = [], art?: IsArt, requirements: Record<string, IsEndingRequirements> = {}): IsTopic[] {
  const stageLinks = new Map(stages.map(s => [s.id.toLowerCase(), s]));
  const topicIds = new Set([...Object.keys(cn.topics ?? {}), ...Object.keys(global.topics ?? {})]);
  return [...topicIds].map(id => {
    const topic = global.topics?.[id] ?? cn.topics?.[id] ?? {};
    const sections: Record<string, IsRecord[]> = {};
    for (const [section, key] of Object.entries({ stages: 'stages', items: 'items', squads: 'items', encounters: 'choiceScenes', endings: 'endings', overview: 'difficulties' })) {
      const merged = new Map<string, IsRecord>();
      for (const [table, source] of [[cn, 'CN'], [global, 'Global']] as const) {
        for (const [index, row] of rows(table.details?.[id]?.[key]).entries()) {
          if (section === 'squads' && row.type !== 'BAND') continue;
          if (section === 'items' && (row.type === 'BAND' || HIDDEN_ITEMS.has(text(row.type)))) continue;
          const copper = section === 'items' && row.type === 'COPPER' ? (((table.modules?.[id] as Row | undefined)?.copper as Row | undefined)?.copperData as Record<string, Row> | undefined)?.[text(row.id)] : undefined;
          // A coin is stored once per gilding; the ungilded one (no gildTypeId) is the coin itself.
          if (copper?.gildTypeId) continue;
          const r = record(row, source, section === 'overview' ? `${text(row.modeDifficulty)}-${String(row.grade ?? index)}` : `${section}-${index}`, art, id);
          if (section === 'items') { r.category = CATEGORY[text(row.type)] ?? 'other'; if (copper) { r.coin = text(copper.groupId).toLowerCase(); const icon = isIcon(art, id, r.coin); if (icon) { r.image = icon; r.imageKind = 'art'; } } }
          if (section === 'squads') {
            const ref = (table.details?.[id]?.bandRef as Record<string, Row> | undefined)?.[r.id];
            if (ref && Number(ref.bandLevel) > 0) r.upgraded = true;
            if (text(row.unlockCondDesc)) { r.unlock = text(row.unlockCondDesc); r.text = text(row.usage) || r.text; }
          }
          if (section === 'endings') { r.number = index + 1; if (requirements[r.id]) r.requirements = requirements[r.id]; const cg = isIcon(art, id, text(row.bgId)); if (cg) r.cg = cg; if (text(row.changeEndingDesc)) r.unlock = text(row.changeEndingDesc); }
          if (section === 'stages') { const stage = stageLinks.get(text(row.levelId).toLowerCase()); if (stage) { r.href = `/stages/browse?s=${encodeURIComponent(stage.slug)}`; if (stage.image) { r.image = `/stages-images/${stage.image}`; r.imageKind = 'map'; } } }
          if (!r.image && (section === 'encounters' || section === 'overview')) { const icon = isNodeIcon(art, section === 'encounters' ? 'adventure' : 'battle'); if (icon) { r.image = icon; r.imageKind = 'mask'; } }
          merged.set(r.id, r);
        }
      }
      if (section === 'squads') {
        // A random-effect squad is stored as a base record plus one record per rolled effect.
        for (const r of [...merged.values()]) {
          const base = merged.get(r.id.replace(/(band_\d+)_\d+$/, '$1'));
          if (!base || base === r) continue;
          if (!(base.variants ??= []).some(v => v.text === r.text)) base.variants.push({ text: r.text });
          merged.delete(r.id);
        }
      }
      if (section === 'items') {
        // Tossed-state duplicates share the coin's icon group; list each coin once.
        const coins = new Set<string>();
        for (const r of [...merged.values()]) if (r.coin) { if (coins.has(r.coin)) merged.delete(r.id); else coins.add(r.coin); }
      }
      sections[section] = [...merged.values()];
    }
    const mergedMechanics = new Map<string, IsRecord>();
    for (const [table, source] of [[cn, 'CN'], [global, 'Global']] as const) for (const r of mechanics(table.modules?.[id], source, '', art, id)) mergedMechanics.set(r.id, r);
    sections.mechanics = [...mergedMechanics.values()];
    const mechanicNodes: Record<string, string> = { SANCHECK: 'san', DICE: 'dice', CHAOS: 'chaos', TOTEMBUFF: 'totem', VISION: 'vision', FRAGMENT: 'fragment', DISASTER: 'disaster', COPPER: 'copper', WRATH: 'wrath', CANDLE: 'candle_duel', WEATHER: 'weather_change', SCRAP: 'scrap_drop' };
    const mechanicIcon = (Array.isArray(topic.moduleTypes) ? topic.moduleTypes : []).map(type => mechanicNodes[String(type)]).find(Boolean) ?? 'relic';
    const tabIcons = Object.fromEntries(Object.entries({ overview: 'adventure', stages: 'battle', items: 'relic', squads: 'recruit', encounters: 'unknown', mechanics: mechanicIcon, endings: 'zone_end' }).flatMap(([tab, name]) => { const icon = isNodeIcon(art, name); return icon ? [[tab, icon]] : []; }));
    const resources = sections.items.filter(r => ['HP', 'GOLD', 'POPULATION', 'EXP'].includes(r.type ?? ''));
    const keyArt = isKeyArt(art, id);
    return { ...(art ? { tabIcons, resources } : {}), ...(keyArt ? { keyArt } : {}), id, name: text(topic.name), intro: text(topic.lineText), source: global.topics?.[id] ? 'Global' as const : 'CN' as const, sections };
  }).sort((a, b) => Number(b.id.split('_')[1]) - Number(a.id.split('_')[1]));
}
