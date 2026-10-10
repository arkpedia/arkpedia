const aliases: Record<string, string> = {
  astgennethelightchase: 'Astgenne the Lightchaser',
  blemmishine: 'Blemishine',
  fiametta: 'Fiammetta',
  matra: 'Mantra',
  radian: 'Raidian',
  thornstelodestar: 'Thorns the Lodestar',
  zuele: 'Zuo Le',
};
const normalize = (name: string) => name.toLowerCase().normalize('NFKD').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');

/** The supplied headerless, semicolon-separated sheet. Resolve names once to stable IDs;
 * blank cells stay unrated, and unknown/duplicate names or invalid scores fail the import. */
export function importAuthorRatings(csv: string, operators: readonly { name: string; id: string }[]) {
  const names = new Map(operators.map(op => [normalize(op.name), op]));
  const ratings: Record<string, number> = {};
  const unrated: string[] = [];
  const seen = new Set<string>();
  for (const [index, row] of csv.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!row.trim()) continue;
    const columns = row.split(';').map(cell => cell.trim());
    if (columns.length !== 2 || !columns[0]) throw new Error(`Rating row ${index + 1}: expected name;score`);
    const name = normalize(columns[0]);
    const operator = names.get(normalize(aliases[name] ?? columns[0]));
    if (!operator) throw new Error(`Rating row ${index + 1}: unknown operator ${columns[0]}`);
    if (seen.has(operator.id)) throw new Error(`Rating row ${index + 1}: duplicate operator ${operator.name}`);
    seen.add(operator.id);
    if (!columns[1]) { unrated.push(operator.name); continue; }
    const rating = Number(columns[1]);
    if (!Number.isFinite(rating) || rating < 5.8 || rating > 7.2) throw new Error(`Rating row ${index + 1}: invalid score ${columns[1]}`);
    ratings[operator.id] = rating;
  }
  return { ratings: Object.fromEntries(Object.entries(ratings).sort(([a], [b]) => a.localeCompare(b))), unrated };
}
