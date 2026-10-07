/*
 * Reads make-golden.py's fixtures (gzipped JSON): the committed compact one (scripts/tests/fixtures/particles)
 * and the full ones a --full run writes. Shared by scripts/tests/test-particles.ts and golden-report.ts; it
 * only decompresses (no size is measured or held to a budget here).
 */
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

export function readGolden<T>(file: string): T {
  return JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8')) as T;
}
