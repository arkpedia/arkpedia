import { useId, useMemo, useState } from 'react';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { VIDEO_TOPICS, discoveryVideoTopic } from '@/lib/music/youtubeDiscovery';
import { currentVideoRelevance, rankDiscoveryVideos, EMPTY_VIDEO_CONTEXT, type VideoDiscoveryContext } from '@/lib/music/youtubeRelevance';
import type { YouTubeVideo } from '@/lib/music/youtube';
import InfoPopover from '@/components/ui/InfoPopover';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { VideoCard } from './StreamCards';

const PREVIEW = 4;
const PAGE = 24;

/** The hub and full video directory share topic rules, filtering and deep links. */
export default function YouTubeVideoGallery({ videos, query, now, context = EMPTY_VIDEO_CONTEXT, grouped = true }: { videos: YouTubeVideo[]; query: string; now: number; context?: VideoDiscoveryContext; grouped?: boolean }) {
  const selectId = useId();
  const [topicQuery, setTopic] = useQueryState('videoTopic', 'all');
  const topic = VIDEO_TOPICS.some(item => item.value === topicQuery) ? topicQuery : 'all';
  const [page, setPage] = useState({ topic, query, shown: PAGE });
  const shown = page.topic === topic && page.query === query ? page.shown : PAGE;
  const needle = query.trim().toLocaleLowerCase();
  const ranked = useMemo(() => rankDiscoveryVideos(videos, context, now), [videos, context, now]);
  const matches = ranked.filter(video => !needle || `${video.title} ${video.channelLabel}`.toLocaleLowerCase().includes(needle));
  const groups = VIDEO_TOPICS.map(item => ({ ...item, videos: matches.filter(video => discoveryVideoTopic(video) === item.value) }));
  const visibleGroups = groups.filter(group => group.videos.length && (topic === 'all' || group.value === topic))
    .sort((a, b) => currentVideoRelevance(b.videos[0], context, now).score - currentVideoRelevance(a.videos[0], context, now).score
      || (Date.parse(b.videos[0].publishedAt) || 0) - (Date.parse(a.videos[0].publishedAt) || 0));
  const card = (video: YouTubeVideo) => <VideoCard key={video.videoId} v={video} relevanceLabel={currentVideoRelevance(video, context, now).label} />;
  return <>
    <div className="youtube-topic-filters">
      <StyledSelect id={selectId} label="Video category" value={topic} onChange={setTopic} options={[
        { value: 'all', label: `All categories (${matches.length})` },
        ...groups.map(group => ({ value: group.value, label: `${group.label} (${group.videos.length})` })),
      ]} />
      <InfoPopover label="How videos are grouped">
        <p>Current Global event guides and available operator/outfit showcases come first, including older videos.</p>
      </InfoPopover>
    </div>
    {!grouped && topic === 'all' ? <>
      <div className="video-grid youtube-topic-grid">
        {matches.slice(0, shown).map(card)}
      </div>
      <LoadOnScroll shown={Math.min(shown, matches.length)} total={matches.length} onMore={() => setPage({ topic, query, shown: shown + PAGE })} />
    </> : <div className="youtube-topic-list">
      {visibleGroups.map(group => {
        const limit = topic === 'all' ? PREVIEW : shown;
        return <section key={group.value} aria-label={group.label}>
          <div className="youtube-topic-heading">
            <h3>{group.label} ({group.videos.length})</h3>
            {topic === 'all' && group.videos.length > PREVIEW && <button className="ghost btn-sm" type="button" aria-label={`View all ${group.label.toLowerCase()} videos`} onClick={() => { document.getElementById(selectId)?.focus(); setTopic(group.value); }}>View all {group.videos.length}</button>}
          </div>
          <div className="video-grid youtube-topic-grid">
            {group.videos.slice(0, limit).map(card)}
          </div>
          {topic !== 'all' && <LoadOnScroll shown={Math.min(shown, group.videos.length)} total={group.videos.length} onMore={() => setPage({ topic, query, shown: shown + PAGE })} />}
        </section>;
      })}
    </div>}
    {!visibleGroups.length && <p className="hint">{videos.length ? 'No matching videos available.' : 'Videos are temporarily unavailable. Try again shortly.'}</p>}
  </>;
}
