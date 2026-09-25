import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { DOCS_ONLY_PATHS, codeFingerprint, globToRegExp, isDocsOnly, uncommittedChanges } from '../content/code-fingerprint.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { judge, main as gate, releaseFromRef } from '../content/deploy-gate.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { SCHEMA } from '../content/release-input.mjs';
import { CONTENT_SCHEMA } from '../../lib/content/types';

/*
 * The release gate (scripts/content/deploy-gate.mjs): a content release goes live only while
 * production serves a /build-info.json naming the code that compiled it. On 2026-09-25 main's
 * generator dropped props that the deployed /farming and /schedule still dereferenced, both
 * sides said schema 2, and nothing stood between the next release and the crash.
 *
 * What these tests hold: the fingerprint moves with every file a build or export can read and
 * with nothing else; the list of files it leaves out is exactly the list Check skips, so a
 * docs-only push (which never deploys) cannot hold releases and a code push cannot slip by;
 * production's build publishes the same fingerprint; and the gate refuses every answer but a
 * clean build of the same code.
 */

const run = promisify(execFile);
function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-gate-'));
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '-q');
  return { dir, git, write, commit, fingerprint: (ref = 'HEAD') => codeFingerprint(ref, { cwd: dir }) as string, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the docs-only globs read as GitHub reads a paths filter', () => {
  const docs = globToRegExp('docs/**'), md = globToRegExp('**/*.md');
  for (const file of ['docs/a.md', 'docs/archive/deep/x.png', 'docs/x']) assert.ok(docs.test(file), file);
  for (const file of ['docsx/a.ts', 'lib/docs/a.ts', 'docs']) assert.ok(!docs.test(file), file);
  for (const file of ['README.md', 'lib/README.md', 'a/b/c/notes.md', '.github/x.md']) assert.ok(md.test(file), file);
  for (const file of ['README.mdx', 'lib/a.md.ts', 'md', 'lib/amd']) assert.ok(!md.test(file), file);
  assert.equal(globToRegExp('lib/*.ts').test('lib/a/b.ts'), false, 'one * stays inside a folder');
  // Forms GitHub reads differently from a plain glob are refused, not approximated.
  for (const glob of ['!docs/**', 'docs/[ab].md', 'docs/{a,b}.md']) assert.throws(() => globToRegExp(glob), /Unsupported docs-only glob/);
});

test('the code fingerprint moves with any file but docs, and ignores the working tree', () => {
  const repo = tempRepo();
  try {
    repo.write('lib/page.ts', 'export const a = 1;\n');
    repo.write('data/records.json', '{}\n');
    repo.write('README.md', 'hello\n');
    repo.write('docs/guide.md', 'guide\n');
    repo.commit('start');
    const start = repo.fingerprint();
    assert.match(start, /^[a-f0-9]{64}$/);
    // Docs change: the same code, the same fingerprint, as for the docs-only push Check skips.
    repo.write('README.md', 'changed\n');
    repo.write('docs/guide.md', 'changed\n');
    repo.write('lib/NOTES.md', 'new\n');
    repo.write('docs/diagram.png', 'binary\n');
    repo.commit('docs only');
    assert.equal(repo.fingerprint(), start);
    // Anything else moves it: code, data, a rename, a mode change, a deletion.
    const edits: [string, () => void][] = [
      ['a page', () => repo.write('lib/page.ts', 'export const a = 2;\n')],
      ['a data file', () => repo.write('data/records.json', '{"a":1}\n')],
      ['a new file', () => repo.write('lib/new.mjs', '\n')],
      ['a rename', () => repo.git('mv', 'lib/new.mjs', 'lib/renamed.mjs')],
      ['a mode change', () => fs.chmodSync(path.join(repo.dir, 'lib/renamed.mjs'), 0o755)],
      // (Deleting lib/renamed.mjs would bring back the tree of 'a data file', and its fingerprint:
      // the same code is the same build, whichever commit it is.)
      ['a deletion', () => fs.rmSync(path.join(repo.dir, 'lib/page.ts'))],
    ];
    const seen = new Set([start]);
    for (const [what, edit] of edits) {
      edit();
      repo.commit(what);
      const next = repo.fingerprint();
      assert.ok(!seen.has(next), `${what} changes the fingerprint`);
      seen.add(next);
    }
    // A commit's fingerprint, whatever the working tree holds (the release job edits data/).
    const head = repo.fingerprint();
    repo.write('data/records.json', '{"edited":"by a refresh stage"}\n');
    assert.equal(repo.fingerprint(), head);
    assert.equal(repo.fingerprint('HEAD~6'), start, 'any commit can be fingerprinted');
    // ...but the working tree is what a build is made from, and it is reported as changed.
    assert.deepEqual(uncommittedChanges({ cwd: repo.dir }), ['data/records.json']);
    repo.write('docs/draft.md', 'wip\n');
    repo.write('lib/untracked.ts', '\n');
    assert.deepEqual(uncommittedChanges({ cwd: repo.dir }).sort(), ['data/records.json', 'lib/untracked.ts']);
  } finally {
    repo.cleanup();
  }
});

// The one list: check.yml skips exactly what the fingerprint leaves out. If Check skipped
// more, a push the fingerprint sees would never deploy and releases would wait for the next
// code push; if it skipped less, nothing breaks, but the file would also say what it is not.
test('Check skips exactly the docs-only paths, on push and pull request, and Deploy follows every Check', () => {
  const check = fs.readFileSync('.github/workflows/check.yml', 'utf8');
  const ignored = [...check.matchAll(/^ {4}paths-ignore: (\[.*\])$/gm)].map(match => JSON.parse(match[1].replace(/'/g, '"')));
  assert.deepEqual(ignored, [DOCS_ONLY_PATHS, DOCS_ONLY_PATHS], 'push and pull_request each ignore exactly config/docs-only-paths.json');
  assert.doesNotMatch(check, /^\s+paths:/m, 'no paths allow-list, which would skip code changes');
  assert.match(check, /^ {2}push:\n {4}branches: \[main\]\n( {4}#.*\n)* {4}paths-ignore:/m);
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(deploy, /^ {2}workflow_run:\n {4}workflows: \[Check\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n/m);
  assert.doesNotMatch(deploy, /paths(-ignore)?:/, 'Deploy runs after every Check on main, never filtered by path');
});

// What Check skips must be what no build reads: a Markdown file a page imported would change
// the site without a deploy, and without the fingerprint noticing.
test('no source file imports a docs-only file', () => {
  const tracked = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  const code = tracked.filter(file => /\.(?:[cm]?[jt]sx?)$/.test(file) && !isDocsOnly(file) && fs.existsSync(file));
  assert.ok(code.length > 500, `found ${code.length} source files`);
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
  const offenders: string[] = [];
  for (const file of code) {
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(specifier)) {
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
      const target = path.relative('.', path.resolve(path.dirname(file), spec));
      if (isDocsOnly(target)) offenders.push(`${file} -> ${spec}`);
    }
  }
  assert.deepEqual(offenders, []);
  // Nor is there a loader through which Next could bundle one.
  assert.doesNotMatch(fs.readFileSync('next.config.js', 'utf8'), /\.mdx?\b|markdown/i);
});

test('the build publishes which code it is, before anything else runs, and never as a release record', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.prebuild, /^node scripts\/build\/write-build-info\.mjs && /, 'the first step of prebuild, before a builder touches the tree');
  // export.mjs publishes every untracked, unignored public/*.json as a source record, which
  // would make every deploy a new release id.
  assert.equal(spawnSync('git', ['check-ignore', '-q', 'public/build-info.json']).status, 0, 'public/build-info.json is gitignored');
  assert.equal(CONTENT_SCHEMA, SCHEMA, 'lib/content/types.ts and scripts/content/release-input.mjs name the same schema');
  const repo = tempRepo();
  try {
    repo.write('lib/page.ts', 'export {};\n');
    repo.write('public/.keep', '');
    const commit = repo.commit('start');
    const write = () => {
      const result = spawnSync(process.execPath, [path.resolve('scripts/build/write-build-info.mjs')], { cwd: repo.dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return { info: JSON.parse(fs.readFileSync(path.join(repo.dir, 'public/build-info.json'), 'utf8')), output: result.stdout + result.stderr };
    };
    fs.writeFileSync(path.join(repo.dir, '.gitignore'), 'public/build-info.json\n');
    repo.commit('ignore it');
    const clean = write();
    assert.deepEqual({ ...clean.info, builtAt: 'x' }, { version: 1, commit: repo.git('rev-parse', 'HEAD'), codeFingerprint: repo.fingerprint(), contentSchema: SCHEMA, dirty: false, builtAt: 'x' });
    assert.notEqual(clean.info.commit, commit);
    // A docs edit leaves the build clean; a code edit makes it a build of no commit.
    repo.write('README.md', 'wip\n');
    assert.equal(write().info.dirty, false);
    repo.write('lib/page.ts', 'export const x = 1;\n');
    const dirty = write();
    assert.equal(dirty.info.dirty, true);
    assert.match(dirty.output, /1 uncommitted change\(s\) \(lib\/page\.ts\)\. Deployed, this build holds every content release/);
  } finally {
    repo.cleanup();
  }
  // Outside a git checkout the build fails: deployed, it would hold every release unexplained.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-nogit-'));
  try {
    fs.mkdirSync(path.join(bare, 'public'));
    const result = spawnSync(process.execPath, [path.resolve('scripts/build/write-build-info.mjs')], { cwd: bare, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(bare) } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot tell which commit this build is/);
    assert.equal(fs.existsSync(path.join(bare, 'public/build-info.json')), false);
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

const release = { generator: 'a'.repeat(40), codeFingerprint: 'c'.repeat(64), schema: 2 };
const built = (extra: object = {}) => ({ version: 1, commit: 'b'.repeat(40), codeFingerprint: 'c'.repeat(64), contentSchema: 2, dirty: false, builtAt: '2026-09-25T00:00:00Z', ...extra });
const site = 'https://arkpedia-dev.vercel.app';

test('the gate publishes only to a clean build of the same code, and holds every other answer', () => {
  // Another commit with the same code (a docs-only push landed after the deploy) is the same build.
  assert.deepEqual(judge({ release, deployments: [{ url: site, info: built() }] }), { publish: true, problems: [] });
  const held = (deployments: object[]) => {
    const verdict = judge({ release, deployments });
    assert.equal(verdict.publish, false);
    return verdict.problems.join('\n');
  };
  // The 2026-09-25 case: production runs older code than the generator.
  assert.match(held([{ url: site, info: built({ codeFingerprint: 'd'.repeat(64) }) }]), /runs bbbbbbbbbbbb, not the code of aaaaaaaaaaaa that compiles the release \(code dddddddddddd there, cccccccccccc here\)/);
  assert.match(held([{ url: site, info: built({ dirty: true }) }]), /built with uncommitted changes/);
  assert.match(held([{ url: site, info: built({ contentSchema: 3 }) }]), /reads content schema 3; the release is schema 2/);
  assert.match(held([{ url: site, error: 'it serves no /build-info.json (a build from before the release gate)' }]), /does not say which code it runs: it serves no \/build-info\.json/);
  assert.match(held([{ url: site, info: '<!doctype html>' }]), /build-info\.json is not a build record/);
  assert.match(held([{ url: site, info: { ...built(), commit: 'main' } }]), /not a build record/);
  assert.match(held([]), /No production deployment is configured/);
  // Every deployment must read it, not most of them.
  assert.match(held([{ url: site, info: built() }, { url: 'https://other.example', info: built({ codeFingerprint: 'e'.repeat(64) }) }]), /^https:\/\/other\.example runs/);
});

/** A production stand-in: serves whatever build-info the case sets, and counts the reads. */
async function withProduction(use: (production: { url: string; serve: (status: number, body: unknown) => void; reads: () => string[] }) => Promise<void>) {
  let answer: { status: number; body: unknown } = { status: 404, body: 'not found' };
  const reads: string[] = [];
  const server = createServer((request, response) => {
    reads.push(`${request.method} ${request.url}`);
    response.statusCode = answer.status;
    response.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await use({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, serve: (status, body) => { answer = { status, body }; }, reads: () => reads });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the gate CLI reads production with one uncached GET and holds with a reason the report can post', async () => {
  const here = releaseFromRef('HEAD');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-gate-cli-'));
  const held = path.join(dir, 'held.md');
  const cli = async (production: string, args: string[]) => {
    fs.rmSync(held, { force: true });
    try {
      const { stdout } = await run(process.execPath, ['scripts/content/deploy-gate.mjs', ...args, '--held-file', held], { env: { ...process.env, ARKPEDIA_DEPLOYMENTS: production, ARKPEDIA_GATE_RETRY_MS: '1' } });
      return { status: 0, stdout, held: fs.existsSync(held) ? fs.readFileSync(held, 'utf8') : '' };
    } catch (error) {
      const failed = error as { code: number; stdout: string };
      return { status: failed.code, stdout: failed.stdout, held: fs.existsSync(held) ? fs.readFileSync(held, 'utf8') : '' };
    }
  };
  try {
    await withProduction(async production => {
      // Production from before the gate: no build-info, so nothing can be shown to match.
      const before = await cli(production.url, ['--ref', 'HEAD']);
      assert.equal(before.status, 1);
      assert.match(before.stdout, /^::error title=Content release held::http:\/\/127\.0\.0\.1:\d+ does not say which code it runs: it serves no \/build-info\.json/m);
      assert.match(before.held, /^\*\*The content release was not published: production cannot be shown to read it\.\*\*/);
      assert.match(before.held, new RegExp(`would be compiled by arkpedia/arkpedia \`${here.generator}\``));
      assert.match(before.held, /let Check and Deploy finish on main/);
      assert.equal(production.reads().length, 1, 'a 404 is an answer, not retried');
      assert.match(production.reads()[0], /^GET \/build-info\.json\?release-gate=\d+$/, 'a GET, with a query no cache has seen');
      // Production runs this code: the gate passes and writes nothing.
      production.serve(200, built({ commit: here.generator, codeFingerprint: here.codeFingerprint }));
      const same = await cli(production.url, ['--ref', 'HEAD']);
      assert.equal(same.status, 0, same.stdout);
      assert.match(same.stdout, /Production runs the code that compiles this release/);
      assert.equal(same.held, '');
      // Production runs other code.
      production.serve(200, built({ codeFingerprint: 'd'.repeat(64) }));
      const other = await cli(production.url, ['--ref', 'HEAD']);
      assert.equal(other.status, 1);
      assert.match(other.held, /runs bbbbbbbbbbbb, not the code of/);
      // A site that errors is retried, then holds.
      production.serve(503, 'busy');
      const before503 = production.reads().length;
      const down = await cli(production.url, ['--ref', 'HEAD']);
      assert.equal(down.status, 1);
      assert.match(down.held, /HTTP 503 after 3 tries/);
      assert.equal(production.reads().length - before503, 3);
      // A compiled release: its manifest's fingerprint must be its generator's.
      const manifest = path.join(dir, 'manifest.json');
      fs.writeFileSync(manifest, JSON.stringify({ schema: 2, generator: here.generator, codeFingerprint: here.codeFingerprint }));
      production.serve(200, built({ commit: here.generator, codeFingerprint: here.codeFingerprint }));
      assert.equal((await cli(production.url, ['--manifest', manifest])).status, 0);
      fs.writeFileSync(manifest, JSON.stringify({ schema: 2, generator: here.generator, codeFingerprint: 'e'.repeat(64) }));
      const forged = await cli(production.url, ['--manifest', manifest]);
      assert.equal(forged.status, 1);
      assert.match(forged.held, /The manifest's code fingerprint eeeeeeeeeeee is not its generator's/);
      fs.writeFileSync(manifest, JSON.stringify({ schema: 2, generator: here.generator }));
      assert.match((await cli(production.url, ['--manifest', manifest])).held, /names no generator commit, code fingerprint and schema/, 'a release from before the fingerprint is held');
    });
    // An unreachable production holds; it never lets the release through.
    const unreachable = await cli('http://127.0.0.1:9', ['--ref', 'HEAD']);
    assert.equal(unreachable.status, 1);
    assert.match(unreachable.held, /does not say which code it runs: .* after 3 tries/);
    // Only https production, but for a local stand-in.
    assert.match((await cli('http://arkpedia-dev.vercel.app', ['--ref', 'HEAD'])).held, /A production deployment must be https/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the gate reads the deployments config/production.json lists', async () => {
  const config = JSON.parse(fs.readFileSync('config/production.json', 'utf8'));
  assert.deepEqual(config.deployments, ['https://arkpedia-dev.vercel.app']);
  const urls: string[] = [];
  const fetch = async (url: string) => { urls.push(url.replace(/\?.*$/, '')); return new Response('nope', { status: 404 }); };
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await gate(['--ref', 'HEAD'], { env: {}, fetch }), 1);
  } finally {
    console.log = log;
  }
  assert.deepEqual(urls, ['https://arkpedia-dev.vercel.app/build-info.json']);
});
