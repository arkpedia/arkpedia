/** Four-call experimental probe. Does not publish categories or run during ingestion. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import examples from '../tests/fixtures/youtube-topic-labels.json';
import { videoTopicRequest, DEFAULT_JEV_MODEL, type VideoTopicSubject } from '../sync/jev-video-classifier';
import { classifyVideoThumbnail, downloadTopicThumbnail, thumbnailTopicRequest } from '../sync/jev-thumbnail-classifier';
import { videoTopicInputHash } from '../../lib/music/youtubeTopicAssignments';
import type { YouTubeVideo } from '../../lib/music/youtube';

const ids = ['EpXI2OO98lM', 'gnKo1qEKVbo', 'p5c-vT4eop4', 'PisV2eSUkoo'];
const output = 'jev-thumbnail-evaluation';
async function evaluate() {
  const live = process.argv.includes('--live'), model = process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL;
  const budget = Number(process.env.JEV_THUMBNAIL_CALL_BUDGET || '0');
  if (live && (!process.env.TYPESAFE_API_KEY || budget !== 4)) throw Error('Live image evaluation requires TYPESAFE_API_KEY and an explicit four-call budget');
  if (ids.length !== 4 || examples.length < 4) throw Error('Unexpected thumbnail evaluation size');
  fs.mkdirSync(output, { recursive: true });
  const results: Record<string, unknown>[] = []; let calls = 0;
  try {
    for (const [index, videoId] of ids.entries()) {
      const example = examples[index];
      const video: YouTubeVideo = { videoId, title: example.title, channelLabel: example.channelLabel,
        description: 'description' in example ? example.description : undefined, publishedAt: '', thumbnail: '', url: '', isLivestream: false, liveStatus: 'none' };
      const subjects = ('subjects' in example ? example.subjects : []) as VideoTopicSubject[];
      const thumbnail = await downloadTopicThumbnail(videoId);
      fs.writeFileSync(path.join(output, `${videoId}.jpg`), thumbnail.bytes);
      const row: Record<string, unknown> = { videoId, expected: example.expected, title: video.title,
        thumbnail: { url: thumbnail.url, sha256: thumbnail.sha256, width: thumbnail.width, height: thumbnail.height, bytes: thumbnail.bytes.length },
        experimentInputHash: createHash('sha256').update(`${videoTopicInputHash(video)}:${thumbnail.sha256}:thumbnail-probe-v1`).digest('hex'),
        request: thumbnailTopicRequest(videoTopicRequest(video, subjects, model)) };
      results.push(row);
      if (live) {
        const assignment = await classifyVideoThumbnail(video, thumbnail, { apiKey: process.env.TYPESAFE_API_KEY!, model, subjects,
          observeRequest: request => { row.request = request; }, fetcher: async (url, init) => {
            if (calls >= budget) throw Error('Thumbnail experiment call budget exhausted');
            calls++;
            const response = await fetch(url, init);
            try { const answer = await response.clone().json(); row.answer = { model: answer.model, answers: answer.answers }; } catch { /* Keep HTTP error in the adapter. */ }
            return response;
          } });
        row.assignment = assignment; row.matched = assignment.topic === example.expected;
        console.log(`${row.matched ? 'PASS' : 'FAIL'} ${videoId}: ${example.expected} → ${assignment.topic} (${assignment.probability.toFixed(3)})`);
      } else console.log(`DRY RUN ${videoId}: ${thumbnail.width} × ${thumbnail.height}, ${thumbnail.bytes.length} bytes; no TypeSafe request`);
    }
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ experimental: true, live, model, calls, results }, null, 2) + '\n');
  }
  if (live && results.some(row => !row.matched)) throw Error('Thumbnail regression probe did not match every label; keep production disabled');
}
void evaluate().catch(error => { console.error(error); process.exitCode = 1; });
