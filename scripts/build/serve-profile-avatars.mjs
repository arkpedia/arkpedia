#!/usr/bin/env node
/** Serve the importer-owned avatar record alongside the other release JSON. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// The picker keeps its current bundled catalogue until this new source record is live.
if (!existsSync('data/profile-avatars.json')) {
  console.log('The release predates the avatar source record; the existing picker remains available.');
  process.exit(0);
}
const record = readFileSync('data/profile-avatars.json', 'utf8');
const catalogue = JSON.parse(record);
if (catalogue.version !== 1 || !Array.isArray(catalogue.icons) || !catalogue.icons.length || !catalogue.facilities) throw new Error('Invalid profile avatar catalogue');
writeFileSync('public/profile-avatars.json', record);
