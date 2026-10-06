#!/usr/bin/env node
/**
 * data/story-chapters.json: each chapter on the Story page's map, section by section, with the
 * place Timo's story reader gives that section, so the page's chapter popup opens one section
 * (its Before or its After) instead of the chapter's start. From the reader's own catalogue,
 * read as data (scripts/lib/timo-chapters.mjs: its code never runs here), for the groups the map
 * links (data/story-map.json, link.story). A run that cannot read the catalogue, or finds far too
 * few chapters, fails, and the stage keeps yesterday's file.
 *
 *   node scripts/imports/import-story-chapters.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chapterSections, timoEntries } from '../lib/timo-chapters.mjs';

export const CATALOG = 'https://arknights.timo.beer/json/catalog.en.json';
const OUT = path.join(process.cwd(), 'data', 'story-chapters.json');

const map = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'story-map.json'), 'utf8'));
const groups = [...new Set(map.elements.filter((e) => e.type === 'picture' && e.link?.story).map((e) => e.link.story))].sort();

let catalog;
try {
  const response = await fetch(CATALOG, { headers: { 'User-Agent': 'ArkpediaBot/1.0 (+https://www.arkpedia.net)' }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  catalog = await response.json();
} catch (error) {
  console.error(`import-story-chapters: Timo's catalogue could not be read (${error instanceof Error ? error.message : error}); yesterday's chapters stay.`);
  process.exit(1);
}

const chapters = {};
const without = [];
for (const group of groups) {
  const entries = timoEntries(catalog, group);
  if (entries?.length) chapters[group] = chapterSections(entries);
  else without.push(group);
}
// The map links some ninety chapters; a catalogue that answers for few of them is not one to publish.
if (Object.keys(chapters).length < Math.min(40, groups.length / 2)) {
  console.error(`import-story-chapters: only ${Object.keys(chapters).length} of the map's ${groups.length} chapters are in Timo's catalogue; yesterday's chapters stay.`);
  process.exit(1);
}
const text = `${JSON.stringify({ about: 'Each Story-map chapter, section by section, as Timo\'s story reader numbers them: [index, code, name, tag]. scripts/imports/import-story-chapters.mjs; generated every refresh, do not edit.', source: CATALOG, chapters })}\n`;
if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) fs.writeFileSync(OUT, text);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(chapters).length} chapters; ${without.length} the reader builds another way (read from their start): ${without.join(', ')}`);
