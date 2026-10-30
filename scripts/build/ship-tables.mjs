#!/usr/bin/env node
/**
 * Copies the tables lib/content/shippedTable.ts names from data/ to public/_tables/, so the
 * Worker reads them from its static files (ASSETS) rather than compiling them into handler.mjs.
 * Run by generate:public (predev, prebuild). public/_tables/ is ignored by git.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SHIPPED = ['regional-schedules.json'];

export function shipTables(root = process.cwd()) {
  const out = path.join(root, 'public/_tables');
  fs.mkdirSync(out, { recursive: true });
  for (const file of SHIPPED) {
    const bytes = fs.readFileSync(path.join(root, 'data', file));
    JSON.parse(bytes);
    fs.writeFileSync(path.join(out, file), bytes);
  }
  return SHIPPED.map(file => `public/_tables/${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(`Shipped ${shipTables().join(', ')}`);
}
