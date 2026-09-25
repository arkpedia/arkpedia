import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { isOperatorReleased } from '../../lib/operators/operatorAvailability';
import { portraitStatus } from '../../lib/operators/operatorPortrait';

const output = {
  operators: getAllOperators().map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    // Still decided when this file is built, so it drifts until the next build; the
    // header search only uses it to pick an icon folder (see the sweep follow-ups).
    isFuture: !isOperatorReleased(operator, Date.now()),
    ...portraitStatus(operator),
    ...(operator.sourceRegion ? { sourceRegion: operator.sourceRegion } : {}),
  })),
};

const destination = path.join(process.cwd(), 'public/operator-search.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${output.operators.length} operator search records to ${destination}`);
