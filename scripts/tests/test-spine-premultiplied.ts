import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every Spine renderer uploads its pages through lib/spine/premultipliedTexture.ts and draws
// premultiplied: spine-ts 3.8 blends Screen and Multiply slots as premultiplied whatever the flag,
// so a straight page drawn straight paints its transparent pixels (Mudrock's Silent Night DN06
// candle light, a solid yellow blob, 2026-10-20).
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : sources(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('no renderer makes a Spine texture except through premultipliedTexture', () => {
  const offenders = ['components', 'lib', 'pages'].flatMap(sources)
    .filter(file => file !== path.join('lib', 'spine', 'premultipliedTexture.ts'))
    .filter(file => /new\s+spine\.webgl\.GLTexture\s*\(/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('every skeleton is drawn premultiplied', () => {
  const offenders = ['components', 'lib', 'pages'].flatMap(sources).flatMap(file => {
    const text = fs.readFileSync(file, 'utf8');
    return [...text.matchAll(/\.drawSkeleton\(\s*[\w.]+\s*,\s*([^,)]+)/g)].filter(match => match[1].trim() !== 'true').map(match => `${file}: ${match[0]}`);
  });
  assert.deepEqual(offenders, []);
});
