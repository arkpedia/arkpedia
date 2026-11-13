/** Public, bounded IS records. Global overrides the same CN record by identity. */
export interface IsRecord { id: string; name: string; text: string; source: 'Global' | 'CN'; type?: string; href?: string }
export interface IsTopic { id: string; name: string; intro: string; source: 'Global' | 'CN'; sections: Record<string, IsRecord[]> }
type Row = Record<string, unknown>;
type Table = { topics?: Record<string, Row>; details?: Record<string, Row>; modules?: Record<string, unknown> };
const rows = (value: unknown): Row[] => value && typeof value === 'object' ? Object.values(value).filter((v): v is Row => !!v && typeof v === 'object') : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
function record(row: Row, source: 'Global' | 'CN', fallback: string): IsRecord {
  return { id: text(row.id) || fallback, name: text(row.name) || text(row.title) || fallback, text: [...new Set(['usage', 'description', 'functionDesc', 'ruleDesc', 'desc', 'unlockCondDesc'].map(k => text(row[k])).filter(Boolean))].join('\n\n'), source, ...(row.type ? { type: text(row.type) } : {}) };
}
function mechanics(value: unknown, source: 'Global' | 'CN', path = ''): IsRecord[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Row;
  if ((row.name || row.title) && ['description', 'functionDesc', 'ruleDesc', 'desc', 'usage'].some(k => text(row[k]))) return [record(row, source, path)];
  return Object.entries(row).flatMap(([key, child]) => mechanics(child, source, `${path}/${key}`));
}
export function projectIs(cn: Table, global: Table, stages: { id: string; slug: string }[] = []): IsTopic[] {
  const stageLinks = new Map(stages.map(s => [s.id.toLowerCase(), `/stages/browse?s=${encodeURIComponent(s.slug)}`]));
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
          const r = record(row, source, section === 'overview' ? `${text(row.modeDifficulty)}-${String(row.grade ?? index)}` : `${section}-${index}`);
          if (section === 'stages') { const href = stageLinks.get(text(row.levelId).toLowerCase()); if (href) r.href = href; }
          merged.set(r.id, r);
        }
      }
      sections[section] = [...merged.values()];
    }
    const mergedMechanics = new Map<string, IsRecord>();
    for (const [table, source] of [[cn, 'CN'], [global, 'Global']] as const) for (const r of mechanics(table.modules?.[id], source)) mergedMechanics.set(r.id, r);
    sections.mechanics = [...mergedMechanics.values()];
    return { id, name: text(topic.name), intro: text(topic.lineText), source: global.topics?.[id] ? 'Global' as const : 'CN' as const, sections };
  }).sort((a, b) => Number(b.id.split('_')[1]) - Number(a.id.split('_')[1]));
}
