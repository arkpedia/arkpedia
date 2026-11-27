import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { archive, mapDetails } from '../../lib/ccb/server';
import { getAllOperators } from '../../lib/operators/operators';
import { getOperatorIconPath } from '../../lib/operators/operatorIcon';
import type { BattleplanData } from '../../lib/ccb/types';

const catalogue: BattleplanData = {
  seasons: [...archive.seasons].reverse().map(season => ({ ...season, maps: season.maps.map(map => {
    const details = mapDetails(map.stage);
    // A season archived before its stage records are published still lists its contracts.
    if (!details) console.warn(`CCB: no stage record for ${map.stage} yet (map ${map.id})`);
    return { ...map, details };
  }) })),
  operators: getAllOperators().map(row => row.name).sort((a, b) => a.localeCompare(b)),
  operatorIcons: Object.fromEntries(getAllOperators().map(row => [row.name, getOperatorIconPath(row)])),
  source: archive.source,
};
const output = path.join(process.cwd(), 'public/_ccb');
fs.mkdirSync(output, { recursive: true });
const bytes = JSON.stringify(catalogue);
const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
// Local rebuilds reuse the directory; each deployment ships one immutable catalogue.
for (const name of fs.readdirSync(output)) {
  if (/^catalogue(?:-[a-f0-9]{16})?\.json$/.test(name)) fs.rmSync(path.join(output, name));
}
const file = `catalogue-${revision}.json`;
fs.writeFileSync(path.join(output, file), bytes);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ catalogueUrl: `/_ccb/${file}` }));
console.log(`Built CCB catalogue: ${catalogue.seasons.length} seasons, ${catalogue.operators.length} operators`);
