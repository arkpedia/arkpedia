import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import './css-modules';
import type { GetStaticProps } from 'next';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { CONTENT_SCHEMA, contentRoute, type ContentManifest, type ContentPointer } from '../../lib/content/types';

/*
 * The Worker's build reads /operators/[name]'s tables from data/ (lib/content/dataTable.ts)
 * where every other build compiles them in. Here the page's own getStaticProps runs both ways,
 * the constant flipped as next.config.js would inline it, and must give the same props: from
 * its builder, and from its finalize filling in what a release lacks.
 */

const ENV_KEYS = ['ARKPEDIA_WORKER', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_EXPORT_CONTENT', 'ARKPEDIA_CONTENT_CHANNEL'] as const;
type Env = Partial<Record<typeof ENV_KEYS[number], string>>;
async function withEnv<T>(values: Env, run: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
  try { return await run(); } finally {
    for (const key of ENV_KEYS) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
}

type Props = Record<string, unknown> & { chibis?: Record<string, unknown>; summons?: unknown[]; skillTimings?: unknown[] };
async function operatorProps(): Promise<GetStaticProps<Props>> {
  // Loaded as CommonJS, the module's exports can arrive as the namespace's default.
  const loaded = await import(path.join(process.cwd(), 'pages/operators/[name].tsx')) as { getStaticProps?: GetStaticProps<Props>; default: { getStaticProps: GetStaticProps<Props> } };
  return loaded.getStaticProps ?? loaded.default.getStaticProps;
}
async function render(getStaticProps: GetStaticProps<Props>, name: string): Promise<Props> {
  const result = await getStaticProps({ params: { name }, revalidateReason: 'build' });
  assert.ok('props' in result, `${name} renders`);
  const props = { ...await result.props } as Props;
  // The request's clock (lib/content/pageClock.ts), not the page.
  delete props.now;
  delete props.buildDay;
  return props;
}

// Ling has summons, Mudrock outfits with their own chibis, Closure neither.
const OPERATORS = ['Ling', 'Mudrock', 'Closure'];

test("the Worker's build gives /operators/[name]'s builder the same tables from data/", async () => {
  const getStaticProps = await operatorProps();
  const seen = { chibis: 0, summons: 0, skillTimings: 0 };
  for (const name of OPERATORS) {
    const compiled = await withEnv({ ARKPEDIA_CONTENT_DISABLED: '1' }, () => render(getStaticProps, name));
    const fromDisk = await withEnv({ ARKPEDIA_CONTENT_DISABLED: '1', ARKPEDIA_WORKER: '1' }, () => render(getStaticProps, name));
    assert.deepEqual(fromDisk, compiled, name);
    seen.chibis += Object.keys(compiled.chibis ?? {}).length;
    seen.summons += (compiled.summons ?? []).length;
    seen.skillTimings += (compiled.skillTimings ?? []).length;
  }
  // Not vacuous: each table gave these operators something.
  for (const [table, count] of Object.entries(seen)) assert.ok(count > 0, `no ${table} for ${OPERATORS.join(', ')}`);
});

test("the Worker's build fills in a release's missing chibis and summons as every other build does", async () => {
  const getStaticProps = await operatorProps();
  const built = Object.fromEntries(await Promise.all(OPERATORS.map(async (name) => [name, await withEnv({ ARKPEDIA_CONTENT_DISABLED: '1' }, () => render(getStaticProps, name))] as const)));

  // A release whose operator pages predate chibis and summons.
  const documents = new Map<string, string>();
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const revision = 'e'.repeat(40), release = 'e'.repeat(64);
  const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: '2026-10-23T00:00:00Z', generator: revision,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
  for (const name of OPERATORS) {
    const props: Props = { ...built[name] };
    delete props.chibis;
    delete props.summons;
    const route = contentRoute('/operators/[name]', { name }), file = pageFilePath(route), body = JSON.stringify({ props });
    documents.set(`/${revision}/release/${file}`, body);
    manifest.pages[route] = { path: file, bytes: Buffer.byteLength(body), sha256: sha(body) };
  }
  const manifestBody = JSON.stringify(manifest);
  documents.set(`/${revision}/release/manifest.json`, manifestBody);
  const pointer: ContentPointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(manifestBody) };
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    const body = documents.get(decodeURIComponent(request.url!));
    if (!body) { response.writeHead(404); response.end(); return; }
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const fromRelease: Env = { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1' };
  try {
    for (const name of OPERATORS) {
      const compiled = await withEnv(fromRelease, () => render(getStaticProps, name));
      const fromDisk = await withEnv({ ...fromRelease, ARKPEDIA_WORKER: '1' }, () => render(getStaticProps, name));
      assert.deepEqual(fromDisk.chibis, compiled.chibis, name);
      assert.deepEqual(fromDisk.summons, compiled.summons, name);
      // And what the backfill gives is what the builder would have published.
      assert.deepEqual(compiled.chibis, built[name].chibis, name);
      assert.deepEqual(compiled.summons, built[name].summons, name);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
