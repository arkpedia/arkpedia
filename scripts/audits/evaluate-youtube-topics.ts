/** Explicitly budgeted metadata evaluation; never run by ordinary CI or a PR event. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import examples from '../tests/fixtures/youtube-topic-labels.json';
import { classifyVideoTopic, videoTopicRequest, DEFAULT_JEV_MODEL, type VideoTopicSubject } from '../sync/jev-video-classifier';
import { resolveCanonicalVideoTopic } from '../sync/canonical-video-topics';
import { applyVideoTopicAssignments, TOPIC_POLICY_VERSION } from '../../lib/music/youtubeTopicAssignments';
import { discoveryVideoTopic, videoTopic, type VideoTopic } from '../../lib/music/youtubeDiscovery';
import type { YouTubeVideo } from '../../lib/music/youtube';

type Example = { title: string; channelLabel: string; description?: string; expected: VideoTopic; subjects?: VideoTopicSubject[] };
export const MAX_EVALUATION_CALLS = 20;
export async function evaluateTopics({ apiKey = process.env.TYPESAFE_API_KEY, budget = Number(process.env.JEV_EVALUATION_CALL_BUDGET),
  fetcher = fetch, output = 'jev-evaluation.json', sample = examples as Example[], model = process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL,
}: { apiKey?: string; budget?: number; fetcher?: typeof fetch; output?: string; sample?: Example[]; model?: string } = {}) {
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_EVALUATION_CALLS || sample.length > budget) throw Error('Evaluation requires an explicit budget of at most 20 calls covering the labeled sample');
  if (!apiKey) throw Error('TYPESAFE_API_KEY must be configured to run a live evaluation');
  const results: Record<string, unknown>[] = []; let calls = 0;
  const report = () => ({ policyVersion: TOPIC_POLICY_VERSION, model, budget, calls, results });
  try {
    for (const [index, example] of sample.entries()) {
      const video: YouTubeVideo = { videoId: `fixture-${index}`, title: example.title, channelLabel: example.channelLabel,
        description: example.description, publishedAt: '', thumbnail: '', url: '', isLivestream: false, liveStatus: 'none' };
      const subjects = example.subjects ?? [];
      const row: Record<string, unknown> = { title: video.title, expected: example.expected, rules: videoTopic(video.title), request: videoTopicRequest(video, subjects, model) };
      results.push(row);
      try {
        const raw = await classifyVideoTopic(video, { apiKey, subjects, model, fetcher: async (url, init) => {
          if (calls >= budget) throw Error('Evaluation call budget exhausted');
          calls++;
          const response = await fetcher(url, init);
          try { const answer = await response.clone().json(); row.answer = { model: answer.model, answers: answer.answers }; } catch { /* Preserve HTTP failures below. */ }
          return response;
        } });
        const assignment = resolveCanonicalVideoTopic(video, raw, subjects.filter(subject => subject.kind === 'operator').map(subject => subject.name));
        const actual = discoveryVideoTopic(applyVideoTopicAssignments([video], { [video.videoId]: assignment })[0]);
        Object.assign(row, { actual, rawAssignment: raw, assignment });
        console.log(`${actual === example.expected ? 'PASS' : 'FAIL'} ${example.expected} → ${actual}: ${video.title} (${raw.probability.toFixed(3)})`);
      } catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
    }
  } finally { fs.writeFileSync(output, JSON.stringify(report(), null, 2) + '\n'); }
  const correct = results.filter(result => result.actual === result.expected).length;
  const reported = new Set(['New Arknights Players Can Get 700 FREE PULLS (and counting) | Arkpedia', 'The Absolute Limit of Arknights RNG']);
  const required = results.filter((result, index) => index < 4 || ['guides', 'clears', 'pulls'].includes(String(result.expected)) || reported.has(String(result.title)));
  console.log(`JEV evaluation: ${correct}/${results.length} correct; ${calls}/${budget} authorized calls used.`);
  if (!results.length || correct / results.length < 0.85 || required.some(result => result.actual !== result.expected)) throw Error('Evaluation failed: original reports, new category boundaries and both new reports must pass, with at least 85% overall accuracy');
  return report();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void evaluateTopics().catch(error => { console.error(error); process.exitCode = 1; });
