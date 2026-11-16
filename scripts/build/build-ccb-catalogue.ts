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
fs.writeFileSync(path.join(output, 'catalogue.json'), JSON.stringify(catalogue));
console.log(`Built CCB catalogue: ${catalogue.seasons.length} seasons, ${catalogue.operators.length} operators`);
