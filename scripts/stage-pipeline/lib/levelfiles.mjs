// The level files present on disk. Content resolution needs this: 168 event
// levels have no stage row at all, and the Battleplan seasons are matched to
// their operations by filename, so "what is in the dump" is an input.
import fs from 'node:fs';
import path from 'node:path';
import { levelsDir } from './gamedata.mjs';

export function levelIds(dir = levelsDir) {
  const out = new Set();
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), next);
      else if (e.name.endsWith('.json')) out.add(next.slice(0, -5).toLowerCase());
    }
  };
  if (!fs.existsSync(dir)) {
    throw new Error(`no level files under ${dir}\n  the EN sparse checkout needs en/gamedata/levels`);
  }
  walk(dir, '');
  return out;
}
