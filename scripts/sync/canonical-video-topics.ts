import { videoTopic } from '../../lib/music/youtubeDiscovery';
import { normalizeVideoText } from '../../lib/music/youtubeRelevance';
import { TOPIC_POLICY_VERSION, videoTopicInputHash, type VideoTopicAssignment } from '../../lib/music/youtubeTopicAssignments';
import type { YouTubeVideo } from '../../lib/music/youtube';

type CatalogueAssignment = VideoTopicAssignment & {
  fallbackFrom?: { model: string; confidence: number; probability: number };
};
const branding = new Set(['Arknights', '명일방주', 'アークナイツ', '明日方舟'].map(normalizeVideoText));

/** A complete list of multiple canonical operator names supplies the subject
 * when a model abstains. Never infer from a creator or a partial name match. */
export function resolveCanonicalVideoTopic(video: YouTubeVideo, assignment: VideoTopicAssignment, names: readonly string[]): CatalogueAssignment {
  if (assignment.topic !== null || assignment.policyVersion !== TOPIC_POLICY_VERSION || assignment.inputHash !== videoTopicInputHash(video)) return assignment;
  const title = video.title.replace(/\[([^\]]*)\]|【([^】]*)】/g, (whole, square, wide) =>
    (square ?? wide).split(/[\/|]/).every((label: string) => branding.has(normalizeVideoText(label))) ? '' : whole);
  const subjects = title.split(/[,|&]/).map(normalizeVideoText).filter(name => name && !branding.has(name));
  const known = new Set(names.map(normalizeVideoText));
  if (new Set(subjects).size < 2 || !subjects.every(name => known.has(name))) return assignment;
  // Ignore credits/social boilerplate, but retain an explicit genre in the intro.
  const introduction = (video.description ?? '').split(/\n\s*\n|={3,}|-{3,}/)[0];
  // An explicit tutorial remains ambiguous when its stage/event scope is missing;
  // narrowing Guides must not turn a generic AFK guide into a name-only showcase.
  if (/\b(guide|tutorial|walkthrough|afk)\b|攻略|공략/i.test(introduction)) return assignment;
  if (!['other', 'operators'].includes(videoTopic(introduction))) return assignment;
  return { ...assignment, topic: 'operators', model: 'catalogue-v1', confidence: 1, probability: 1,
    fallbackFrom: { model: assignment.model, confidence: assignment.confidence, probability: assignment.probability } };
}
