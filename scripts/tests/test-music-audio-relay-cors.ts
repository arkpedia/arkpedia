import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('the audio relay exposes only public media responses to credential-free browser preloading', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arkpedia-audio-'));
  const socketPath = path.join(dir, 'test.sock');
  const child = spawn(process.execPath, ['infra/audio-relay/server.mjs'], { env: { ...process.env, ARKAUDIO_SOCKET: socketPath }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout!, 'data'), once(child, 'exit').then(() => { throw new Error('Relay exited before startup'); })]);
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ socketPath, path: '/not-a-song', headers: { Origin: 'https://www.arkpedia.net' } }, resolve).on('error', reject);
    });
    response.resume();
    assert.equal(response.statusCode, 404, 'invalid destinations still never reach upstream');
    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  } finally {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; }
    await rm(dir, { recursive: true, force: true });
  }
});
