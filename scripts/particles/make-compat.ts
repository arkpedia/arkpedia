/*
 * The compat fixture (scripts/tests/fixtures/particles/compat.json.gz): a published layers.json (today's, without
 * particles) and the same folder's export with them (layerParticles.json's pointer and `{particles}` runs), each
 * with what the DEPLOYED reader draws from it: the www and arkpedia-dev reader's parseDynamicLayers, read from git
 * (origin/main and origin/dev are identical at the time of writing; the script checks both). Then
 * scripts/tests/test-dynamic-art.ts holds the new reader to it: today's file drawn exactly as before, and the
 * particle file's layers and parts drawn in the same order the deployed reader draws them, its runs in between.
 *
 *     npx tsx scripts/particles/make-compat.ts TODAY/layers.json PARTICLES/layers.json scripts/tests/fixtures/particles/compat.json.gz
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

type Reader = (value: unknown) => { textures: { file: string }[]; bounds: unknown; draw: ({ kind: string; index?: number; layer?: { name: string } })[]; skipped: number };

/** What a reader draws from a file: its draw entries (parts by number, layers by name), skipped, textures, bounds. */
export function drawn(read: Reader, value: unknown) {
  const out = read(value);
  return {
    draw: out.draw.map((e) => (e.kind === 'part' ? e.index : e.layer!.name)),
    skipped: out.skipped, textures: out.textures.map((t) => t.file), bounds: out.bounds,
  };
}

async function readerAt(ref: string): Promise<Reader> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-'));
  const file = path.join(dir, 'dynamicLayers.ts');
  fs.writeFileSync(file, execFileSync('git', ['show', `${ref}:lib/skins/dynamicLayers.ts`], { encoding: 'utf8' }));
  return (await import(file)).parseDynamicLayers as Reader;
}

async function main() {
  const [today, particles, out] = process.argv.slice(2);
  const main = await readerAt('origin/main'), dev = await readerAt('origin/dev');
  const files = { today: JSON.parse(fs.readFileSync(today, 'utf8')), particles: JSON.parse(fs.readFileSync(particles, 'utf8')) };
  for (const value of Object.values(files)) {
    if (JSON.stringify(drawn(main, value)) !== JSON.stringify(drawn(dev, value))) throw new Error('main and dev readers differ: record both');
  }
  const fixture = {
    generator: 'scripts/particles/make-compat.ts', reader: execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(),
    today: { file: files.today, deployed: drawn(main, files.today) },
    particles: { file: files.particles, deployed: drawn(main, files.particles) },
  };
  fs.writeFileSync(out, gzipSync(JSON.stringify(fixture), { level: 9 }));
  console.log(JSON.stringify({ today: fixture.today.deployed.draw.length, particles: fixture.particles.deployed.draw.length, skipped: fixture.particles.deployed.skipped,
    bytes: fs.statSync(out).size }));
}

main().catch((error) => { console.error(error); process.exit(1); });
