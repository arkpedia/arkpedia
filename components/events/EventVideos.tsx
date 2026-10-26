import { requestExternalMedia } from '@/lib/privacy/preferences';
import { useEffect, useRef, useState } from 'react';
import Image from '@/components/content/ContentImage';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { packDay } from '@/lib/events/packDay';
import { VIDEO_KIND_LABELS, VIDEO_RUN_LABELS, type EventVideo, type EventVideoRun } from '@/lib/events/eventVideos';

/*
 * The event page's PVs tab: the event's official videos (data/event-videos.json), each a
 * thumbnail until the reader presses it. Only then is YouTube's player put in its place, so
 * opening the tab loads no player and plays nothing. One video plays at a time.
 *
 * The site's music player keeps its own YouTube player (lib/music/musicPlayerContext.tsx, which
 * owns window.YT and onYouTubeIframeAPIReady), so these are plain embeds and never load that
 * API. Pressing a video pauses a song that is playing, through the player's own pausePlayback, so
 * its controls say so; starting the song again pauses the video, by the embed's postMessage
 * command (enablejsapi=1). Neither ever starts the other.
 */

const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

function embedUrl(videoId: string): string {
  const params = new URLSearchParams({ autoplay: '1', enablejsapi: '1', playsinline: '1', rel: '0', origin: window.location.origin });
  return `${EMBED_ORIGIN}/embed/${videoId}?${params}`;
}

/** `run`: the page's own run. Where the list holds another run's videos too (a rerun's page lists
 *  its launch's trailer, PVs and EPs), each video says which run it was released for. */
export function EventVideos({ videos, run }: { videos: EventVideo[]; run: EventVideoRun }) {
  const mixed = videos.some((video) => video.run && video.run !== run);
  const music = useMusicPlayer();
  const [playing, setPlaying] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const songOn = music.isPlaying || music.buffering;
  const songWasOn = useRef(songOn);
  useEffect(() => {
    // The song started again (its Play, a media key, the next track) while a video is up.
    if (songOn && !songWasOn.current && playing) {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), EMBED_ORIGIN);
    }
    songWasOn.current = songOn;
  }, [songOn, playing]);

  function play(videoId: string) {
    requestExternalMedia(() => {
      if (music.isPlaying || music.buffering) music.pausePlayback();
      setPlaying(videoId);
    });
  }

  return (
    <div className="event-videos">
      {videos.map((video) => {
        const label = VIDEO_KIND_LABELS[video.kind] ?? VIDEO_KIND_LABELS.video;
        return (
          <figure key={video.videoId} className="event-video">
            {/* One box for the picture and the player, 16:9 either way: pressing play changes no height. */}
            <div className="event-video-frame">
              {playing === video.videoId ? (
                <iframe
                  ref={frameRef}
                  src={embedUrl(video.videoId)}
                  title={video.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button type="button" className="btn-bare event-video-play" onClick={() => play(video.videoId)} aria-label={`Play ${video.title}`}>
                  <Image src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 700px) 100vw, 400px" style={{ objectFit: 'cover' }} />
                  <span className="event-video-play-icon" aria-hidden="true" />
                </button>
              )}
            </div>
            <figcaption className="event-video-copy">
              <span className="event-video-meta">{label}{mixed ? ` · ${VIDEO_RUN_LABELS[video.run ?? run]}` : ''} · {packDay(video.published)}</span>
              <a className="event-video-title" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">{video.title}</a>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
