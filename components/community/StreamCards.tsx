import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { YouTubeVideo } from '@/lib/music/youtube';
import { TwitchStream } from '@/lib/community/twitch';

/** The community pages' eyebrow: the section, with a crumb back to the hub. */
export function CommunityEyebrow() {
  return <>Rhodes Island // <Link href="/community" prefetch={false}>World</Link></>;
}

export function VideoCard({ v, live }: { v: YouTubeVideo; live?: boolean }) {
  return (
    <a href={v.url} target="_blank" rel="noreferrer" className="video-card">
      <div className="video-thumb">
        {live && <span className="badge-live live-now-badge">LIVE NOW</span>}
        <span className="creator-name-badge">{v.channelLabel}</span>
        <Image src={v.thumbnail} alt={v.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
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
        <span className="badge-live live-now-badge">LIVE</span>
        <span className="viewer-count-badge">{s.viewerCount.toLocaleString()} watching</span>
        <span className="creator-name-badge">{s.displayName}</span>
        <Image src={s.thumbnailUrl} alt={s.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
      </div>
      <div className="video-card-body">
        <p className="video-title">{s.title}</p>
      </div>
    </a>
  );
}