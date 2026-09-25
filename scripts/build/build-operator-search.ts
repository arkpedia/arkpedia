import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { isOperatorReleased } from '../../lib/operators/operatorAvailability';
import { portraitStatus } from '../../lib/operators/operatorPortrait';

const output = {
  operators: getAllOperators().map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    isFuture: !isOperatorReleased(operator),
    ...portraitStatus(operator),
    ...(operator.sourceRegion ? { sourceRegion: operator.sourceRegion } : {}),
  })),
};

const destination = path.join(process.cwd(), 'public/operator-search.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${output.operators.length} operator search records to ${destination}`);
