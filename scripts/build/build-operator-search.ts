import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { portraitStatus } from '../../lib/operators/operatorPortrait';

const output = {
  operators: getAllOperators().map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    // No release state: the header search draws a record from its name, rarity and
    // portraitStatus. An isFuture judged when this file was built used to sit here, frozen
    // until the next build, and nothing read it.
    ...portraitStatus(operator),
    ...(operator.sourceRegion ? { sourceRegion: operator.sourceRegion } : {}),
  })),
};

const destination = path.join(process.cwd(), 'public/operator-search.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${output.operators.length} operator search records to ${destination}`);
