/** Paid live evaluation: deliberately separate from npm test and normal CI. */
import fs from 'node:fs';
import examples from '../tests/fixtures/youtube-topic-labels.json';
import { classifyVideoTopic, videoTopicRequest, type VideoTopicSubject } from '../sync/jev-video-classifier';
import { applyVideoTopicAssignments } from '../../lib/music/youtubeTopicAssignments';
import { discoveryVideoTopic, videoTopic } from '../../lib/music/youtubeDiscovery';
import type { YouTubeVideo } from '../../lib/music/youtube';

async function evaluate() {
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY must be configured to run a live evaluation');
  if (examples.length > 24) throw new Error('Evaluation exceeds the authorized 24-call budget');
  const results = [];
  for (const [index, example] of examples.entries()) {
    const video: YouTubeVideo = { videoId: `fixture-${index}`, title: example.title, channelLabel: example.channelLabel,
      description: 'description' in example ? example.description : undefined,
      publishedAt: '', thumbnail: '', url: '', isLivestream: false, liveStatus: 'none' };
    const subjects = ('subjects' in example ? example.subjects : []) as VideoTopicSubject[];
    const assignment = await classifyVideoTopic(video, { apiKey: process.env.TYPESAFE_API_KEY, subjects });
    const actual = discoveryVideoTopic(applyVideoTopicAssignments([video], { [video.videoId]: assignment })[0]);
    results.push({ title: video.title, expected: example.expected, actual, rules: videoTopic(video.title), ...assignment,
      request: videoTopicRequest(video, subjects) });
    console.log(`${actual === example.expected ? 'PASS' : 'FAIL'} ${example.expected} → ${actual}: ${video.title} (${assignment.probability.toFixed(3)})`);
  }
  const correct = results.filter(result => result.actual === result.expected).length;
  console.log(`JEV evaluation: ${correct}/${results.length} correct; rules: ${results.filter(result => result.rules === result.expected).length}/${results.length}.`);
  fs.writeFileSync('jev-evaluation.json', JSON.stringify(results, null, 2) + '\n');
  if (correct / results.length < 0.85 || results.slice(0, 4).some(result => result.actual !== result.expected)) {
    throw new Error('JEV evaluation failed acceptance: all four reported examples and at least 85% of the labeled set must pass');
  }
}
void evaluate().catch(error => { console.error(error); process.exitCode = 1; });
