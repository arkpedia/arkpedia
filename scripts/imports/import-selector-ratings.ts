import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { importAuthorRatings } from '../../lib/selectors/ratings';

const source = 'config/selector-ratings.csv';
const operators = getAllOperators().filter(op => op.rarity === 6).map(op => ({ name: op.name, id: op.internalName! }));
const imported = importAuthorRatings(fs.readFileSync(source, 'utf8'), operators);
fs.writeFileSync('config/selector-ratings.json', JSON.stringify({
  about: "Kukkikaze's supplied ratings, keyed by immutable character ID; Ling corrected to 6.7 by the user. Blank cells remain unrated.",
  source,
  ...imported,
}, null, 2) + '\n');
console.log(`Imported ${Object.keys(imported.ratings).length} ratings; ${imported.unrated.length} blank cells remain unrated.`);
