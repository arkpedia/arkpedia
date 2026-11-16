import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import examples from './fixtures/youtube-topic-labels.json';
import { evaluateTopics } from '../audits/evaluate-youtube-topics';
import { VIDEO_TOPICS } from '../../lib/music/youtubeDiscovery';

test('paid metadata evaluation enforces its approved call limit and never records credentials', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-evaluation-'));
  const output = path.join(folder, 'results.json'); let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const request = JSON.parse(init!.body as string);
    const example = examples.find(example => example.title === request.state.video.title)!;
    return Response.json({ model: 'jev-test', answers: { topic: { type: 'choice', choice: example.expected, confidence: 1,
      probabilities: Object.fromEntries(VIDEO_TOPICS.map(topic => [topic.value, topic.value === example.expected ? 1 : 0])) } } });
  };
  try {
    for (const budget of [0, 19, 21, NaN]) await assert.rejects(evaluateTopics({ apiKey: 'test-secret', budget, fetcher, output }), /explicit budget/);
    assert.equal(calls, 0);
    const result = await evaluateTopics({ apiKey: 'test-secret', budget: 20, fetcher, output });
    assert.equal(result.calls, 20); assert.equal(calls, 20);
    assert.equal(result.results.length, 20);
    assert.ok(result.results.every(row => row.answer && row.request));
    assert.ok(!fs.readFileSync(output, 'utf8').includes('test-secret'));
    await assert.rejects(evaluateTopics({ apiKey: 'test-secret', budget: 20, output, fetcher: async () => { throw Error('provider unavailable'); } }), /provider unavailable/);
    const failed = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(failed.calls, 1); assert.equal(failed.results.length, 1);
    assert.equal(failed.results[0].error, 'provider unavailable');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
