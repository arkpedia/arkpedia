/** Small deploy fallback for a new guide route. Each content/build run regenerates it
 * from that run's operator data; published page props remain the runtime source of truth. */
import fs from 'node:fs';
import { buildSelectorCatalogue } from '../../lib/selectors/catalogue';
const destination = 'data/selector-catalogue.json';
const text = JSON.stringify(buildSelectorCatalogue()) + '\n';
if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== text) fs.writeFileSync(destination, text);
