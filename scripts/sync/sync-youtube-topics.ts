/** Bounded offline classification during content preparation. Never imported by the Worker. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChannelFeedReader } from '../../lib/music/youtubeFeedCache';
import { filterDiscoveryVideos } from '../../lib/music/youtubeDiscovery';
import { TOPIC_POLICY_VERSION, videoTopicInputHash, type VideoTopicAssignments } from '../../lib/music/youtubeTopicAssignments';
import { readLocalVideoArchive } from '../../lib/music/youtubeArchiveServer';
import { VIDEO_TOPICS_RECORD, readLocalVideoTopics } from '../../lib/music/youtubeTopicsServer';
import { getAllOperators } from '../../lib/operators/operators';
import { getAllSkins } from '../../lib/skins/skins';
import { mentionsVideoSubject } from '../../lib/music/youtubeRelevance';
import { classifyVideoTopic, DEFAULT_JEV_MODEL, type VideoTopicSubject } from './jev-video-classifier';
import type { YouTubeVideo } from '../../lib/music/youtube';
import { resolveCanonicalVideoTopic } from './canonical-video-topics';

export const TOPIC_CACHE_FILE = '.cache/youtube-discovery/topics.json';
const MAX_CALLS = 160;
const MAX_AGE_MS = 30 * 86400000;

export async function refreshVideoTopics(now = Date.now()) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) { console.warn('JEV: TYPESAFE_API_KEY is unset; retaining cached topics and using rules for new videos.'); return; }
  const model = process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL;
  let cache: VideoTopicAssignments = {};
  try { cache = JSON.parse(fs.readFileSync(TOPIC_CACHE_FILE, 'utf8')); } catch { /* First run. */ }
  // A held/unpublished preparation can have a newer Actions cache than the
  // hydrated record. Keep the newest result at each ID to avoid repeat billing.
  for (const [id, entry] of Object.entries(readLocalVideoTopics())) {
    if (!cache[id] || Date.parse(entry.checkedAt) >= Date.parse(cache[id].checkedAt)) cache[id] = entry;
  }
  const registry = JSON.parse(fs.readFileSync('data/youtube-creators.json', 'utf8')) as { channels: { id: string; label: string }[] };
  const reader = createChannelFeedReader();
  const feeds: YouTubeVideo[][] = [];
  for (let offset = 0; offset < registry.channels.length; offset += 4) {
    feeds.push(...await Promise.all(registry.channels.slice(offset, offset + 4).map(async channel => {
      try { return (await reader(channel.id, channel.label, null)).slice(0, 6); }
      catch { console.warn(`JEV: feed unavailable for ${channel.label}; keeping previous classifications.`); return []; }
    })));
  }
  const candidates = [...new Map([...readLocalVideoArchive(), ...feeds.flat()].map(video => [video.videoId, video])).values()];
  const eligible = filterDiscoveryVideos(candidates).filter(video => !video.isLivestream && video.liveStatus === 'none' && !video.topicHint)
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const operators = getAllOperators();
  const operatorNames = operators.map(operator => operator.name);
  // Revisit cached abstentions too: a clearer catalogue must not wait 30 days or
  // spend another model request before fixing a known name-only showcase.
  for (const video of eligible) if (cache[video.videoId]) {
    cache[video.videoId] = resolveCanonicalVideoTopic(video, cache[video.videoId], operatorNames);
  }
  const pending = eligible.filter(video => {
    const saved = cache[video.videoId];
    return !saved || saved.inputHash !== videoTopicInputHash(video) || saved.policyVersion !== TOPIC_POLICY_VERSION
      || saved.requestedModel !== model || now - Date.parse(saved.checkedAt) >= MAX_AGE_MS;
  }).slice(0, MAX_CALLS);
  const subjects: VideoTopicSubject[] = [...operators.map(operator => ({ name: operator.name, kind: 'operator' as const })),
    ...getAllSkins().map(skin => ({ name: skin.name, kind: 'outfit' as const }))];
  let failed = 0;
  for (let offset = 0; offset < pending.length; offset += 8) {
    await Promise.all(pending.slice(offset, offset + 8).map(async video => {
      try {
        const assignment = await classifyVideoTopic(video, { apiKey, model, now,
          subjects: subjects.filter(subject => mentionsVideoSubject(video.title, [subject.name])).slice(0, 16) });
        cache[video.videoId] = resolveCanonicalVideoTopic(video, assignment, operatorNames);
      } catch (error) { failed++; console.warn(`JEV: ${video.videoId}: ${error instanceof Error ? error.message : 'request failed'}; rules remain available.`); }
    }));
  }
  // Stable order and unchanged timestamps avoid releases from cache bookkeeping alone.
  const kept = Object.fromEntries(Object.entries(cache).sort(([, a], [, b]) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt)).slice(0, 2500).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(TOPIC_CACHE_FILE), { recursive: true });
  const json = JSON.stringify(kept) + '\n';
  fs.writeFileSync(TOPIC_CACHE_FILE, json);
  fs.writeFileSync(VIDEO_TOPICS_RECORD, json);
  console.log(`JEV: ${pending.length - failed} classified, ${failed} failed, ${eligible.length - pending.length} cached/deferred; ${Object.keys(kept).length} retained. Limit ${MAX_CALLS} calls/run.`);
  if (pending.length && failed === pending.length) throw new Error('JEV classification unavailable; cached topics were preserved.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void refreshVideoTopics().catch(error => { console.error(error); process.exitCode = 1; });
