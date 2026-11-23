// Compile a small fallback that a cold Worker can read before its content release includes the page.
import {writeFileSync} from 'node:fs';
import {enemyTargets} from '../../lib/dps/enemyTargets';
writeFileSync('data/dps-enemy-presets.json',JSON.stringify(enemyTargets())+'\n');
