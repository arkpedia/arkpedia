import Image from '@/components/content/ContentImage';
import { YouTubeVideo } from '@/lib/music/youtube';
import { TwitchStream } from '@/lib/community/twitch';

export function VideoCard({ v, live }: { v: YouTubeVideo; live?: boolean }) {
  return (
    <a href={v.url} target="_blank" rel="noreferrer" className="video-card">
      <div className="video-thumb">
        {live && <span className="live-now-badge">● LIVE NOW</span>}
        <span className="creator-name-badge">{v.channelLabel}</span>
        <Image src={v.thumbnail} alt={v.title} fill loading="lazy" sizes="384px" style={{ objectFit: 'cover' }} />
      </div>
      <div className="video-card-body">
        <p className="video-title">{v.title}</p>
      </div>
    </a>
  );
}

export function TwitchCard({ s }: { s: TwitchStream }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="video-card">
      <div className="video-thumb">
        <span className="live-now-badge live-now-badge-twitch">● LIVE</span>
        <span className="viewer-count-badge">{s.viewerCount.toLocaleString()} watching</span>
        <span className="creator-name-badge">{s.displayName}</span>
        <Image src={s.thumbnailUrl} alt={s.title} fill loading="lazy" sizes="384px" style={{ objectFit: 'cover' }} />
      </div>
      <div className="video-card-body">
        <p className="video-title">{s.title}</p>
      </div>
    </a>
  );
}