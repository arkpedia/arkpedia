import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { minimizeMusicPlayer, openMusicPlayer, playerIsVisible, usePlayerVisibility } from '@/lib/music/playerVisibility';
import MusicTransportBar from './MusicTransportBar';
import TransportIcon from './TransportIcons';
import QueuePanel from './QueuePanel';
import { isQueuePanelOpen, queuePanelHref } from '@/lib/music/queuePanelHref';

/** Persistent audio host and entry point for the same transport used throughout Music. */
export default function MusicPlayer() {
  const { ready, isPlaying, starting, buffering, videoId, title, currentTrack, initializePlayer, containerRef } = useMusicPlayer();
  const router = useRouter();
  const onMusicPage = router.pathname === '/music' || router.pathname === '/music/discover';
  const mode = usePlayerVisibility();
  const active = Boolean(videoId) && (isPlaying || starting || buffering);
  const collapsed = !playerIsVisible(mode, onMusicPage, active);
  const excluded = router.pathname === GAME_PATHS.music;

  // Once playback exposes the player, pausing and navigating keep it visible.
  // A manual minimize overrides subsequent songs until the reader opens it again.
  useEffect(() => { if (active && mode === 'auto') openMusicPlayer(); }, [active, mode]);

  const [announcement, setAnnouncement] = useState('');
  const announcedTrack = useRef<string | null>(null);
  useEffect(() => {
    if (!videoId) return;
    if (announcedTrack.current && announcedTrack.current !== videoId && !onMusicPage) setAnnouncement(`Now playing: ${currentTrack?.title || title}`);
    announcedTrack.current = videoId;
  }, [videoId, currentTrack?.title, title, onMusicPage]);

  const minimize = () => {
    if (isQueuePanelOpen(router)) void router.replace(queuePanelHref(router, false), undefined, { shallow: true, scroll: false }).then(() => minimizeMusicPlayer());
    else minimizeMusicPlayer();
  };

  return <div className={`music-player${collapsed ? ' collapsed' : ''}${onMusicPage && !collapsed ? ' music-player-offstage' : ''}`}
    data-music-widget={(!onMusicPage || collapsed) && !excluded ? '' : undefined}
    style={excluded ? { display: 'none' } : undefined}
    onKeyDown={event => {
      if (onMusicPage || event.key !== 'Escape' || event.defaultPrevented || collapsed || isQueuePanelOpen(router) || (event.target as Element).closest('[role="dialog"]')) return;
      event.stopPropagation(); minimizeMusicPlayer();
    }}>
    <div ref={containerRef} className="music-hidden-frame" />
    <div className="visually-hidden" aria-live="polite">{announcement}</div>
    {collapsed && <button type="button" className="btn-bare music-collapse-toggle" aria-label="Expand player"
      onClick={() => {
        if (!ready) initializePlayer(false);
        openMusicPlayer();
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[aria-label="Minimize player"]')?.focus({ preventScroll: true }));
      }}><TransportIcon name="note" size={20} /></button>}
    {!onMusicPage && !excluded && <MusicTransportBar view="library" />}
    {!onMusicPage && !excluded && !collapsed && <button type="button" className="btn-bare music-floating-toggle" aria-label="Minimize player" title="Minimize player" onClick={minimize}><TransportIcon name="down" size={20} /></button>}
    {!excluded && <QueuePanel />}
  </div>;
}
