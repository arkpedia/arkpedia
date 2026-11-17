/** Older data releases predate the fallback reader. Supply its empty, bundled snapshot once. */
import fs from 'node:fs';
const file = 'data/story-native.json';
if (!fs.existsSync(file)) fs.writeFileSync(file, '{"chapters":{}}\n');
