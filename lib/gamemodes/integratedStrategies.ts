import { isIcon, isNodeIcon, type IsArt } from './isArt';
/** Public, bounded IS records. Global overrides the same CN record by identity. */
export interface IsRecord { id: string; name: string; text: string; source: 'Global' | 'CN'; type?: string; href?: string; image?: string; imageKind?: 'art' | 'mask' | 'map' }
export interface IsTopic { id: string; name: string; intro: string; source: 'Global' | 'CN'; sections: Record<string, IsRecord[]>; resources?: IsRecord[]; tabIcons?: Record<string, string> }
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
export function projectIs(cn: Table, global: Table, stages: { id: string; slug: string; image?: string }[] = [], art?: IsArt): IsTopic[] {
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
          if (section === 'items' && row.type === 'BAND') continue;
          const r = record(row, source, section === 'overview' ? `${text(row.modeDifficulty)}-${String(row.grade ?? index)}` : `${section}-${index}`, art, id);
          if (section === 'stages') { const stage = stageLinks.get(text(row.levelId).toLowerCase()); if (stage) { r.href = `/stages/browse?s=${encodeURIComponent(stage.slug)}`; if (stage.image) { r.image = `/stages-images/${stage.image}`; r.imageKind = 'map'; } } }
          if (!r.image && (section === 'encounters' || section === 'overview')) { const icon = isNodeIcon(art, section === 'encounters' ? 'adventure' : 'battle'); if (icon) { r.image = icon; r.imageKind = 'mask'; } }
          merged.set(r.id, r);
        }
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
    return { ...(art ? { tabIcons, resources } : {}), id, name: text(topic.name), intro: text(topic.lineText), source: global.topics?.[id] ? 'Global' as const : 'CN' as const, sections };
  }).sort((a, b) => Number(b.id.split('_')[1]) - Number(a.id.split('_')[1]));
}
