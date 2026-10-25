// Shared generated-data contract for publisher and portable delivery reader.
import { pageFilePath } from './pagePaths.mjs';
const SHA = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const record = value => value && typeof value === 'object' && !Array.isArray(value);

/** The isolated pilot's publication contract; shared by writer and portable reader. */
export function stagingPointer(value) {
  if (!record(value) || value.format !== 1 || !SHA.test(value.manifestSha256) || !Number.isSafeInteger(value.manifestBytes)
    || value.manifestBytes < 1 || value.manifestBytes > 5_000_000 || !REVISION.test(value.revision) || !SHA.test(value.release)
    || !Number.isSafeInteger(value.generation) || value.generation < 1) throw new Error('Invalid staging pointer');
  return value;
}

function descriptor(file) {
  if (!file || typeof file.path !== 'string' || !/^(?:pages|public)\//.test(file.path)
    // eslint-disable-next-line no-control-regex -- Storage paths must reject ASCII control bytes.
    || /[\\?#\x00-\x1f\x7f]/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..')
    || !SHA.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 25_000_000) throw new Error('Invalid delivery object');
  return { sha256: file.sha256, bytes: file.bytes, key: `pilot-v1/objects/${file.sha256}` };
}

export function releaseManifest(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 5_000_000) throw new Error('Content manifest too large');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (manifest.schema !== 2 || !SHA.test(manifest.release) || !record(manifest.pages) || !Object.keys(manifest.pages).length || !record(manifest.files)
    || !record(manifest.assets) || !manifest.assets['arkpedia-image-assets'] || !manifest.assets['arkpedia-skin-assets']
    || !Object.values(manifest.assets).every(pin => REVISION.test(pin))) throw new Error('Unsupported release manifest');
  const objects = new Map();
  for (const [route, file] of Object.entries(manifest.pages)) {
    if (file?.path !== pageFilePath(route)) throw new Error('Content page path mismatch');
  }
  const files = [...Object.values(manifest.pages), ...Object.values(manifest.files)]
    .map(file => ({ path: file?.path, value: descriptor(file) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const sizes = new Map();
  for (const { path, value } of files) {
    if (sizes.has(value.key) && sizes.get(value.key) !== value.bytes) throw new Error('Conflicting delivery object sizes');
    sizes.set(value.key, value.bytes);
    if (objects.has(path) && JSON.stringify(objects.get(path)) !== JSON.stringify(value)) throw new Error('Conflicting content paths');
    objects.set(path, value);
  }
  return { manifest, objects };
}
