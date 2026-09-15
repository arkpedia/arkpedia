import assert from 'node:assert/strict';
import test from 'node:test';
import { getSkinArtworkOriginal, getSkinArtworkSources } from '../lib/assets/skinArtwork';

test('derives lossless and responsive artwork URLs from a legacy skin path', () => {
  const source = '/six-star-skins/Thorns%20the%20Lodestar%20-%20Elite%202.webp';
  const result = getSkinArtworkSources(source);
  assert.ok(result);
  assert.equal(result.original, '/skin-originals/six-star-skins/Thorns%20the%20Lodestar%20-%20Elite%202.png');
  assert.equal(result.webp[320], '/skin-variants/webp/w320/six-star-skins/Thorns%20the%20Lodestar%20-%20Elite%202.webp');
  assert.equal(result.avif[1280], '/skin-variants/avif/w1280/six-star-skins/Thorns%20the%20Lodestar%20-%20Elite%202.avif');
});

test('leaves non-artwork paths unchanged for zoom', () => {
  const icon = '/six-star-icons/Thorns%20the%20Lodestar%20-%20Base.webp';
  assert.equal(getSkinArtworkSources(icon), null);
  assert.equal(getSkinArtworkOriginal(icon), icon);
});
