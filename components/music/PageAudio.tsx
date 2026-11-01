import { useEffect, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { loadYouTubeApi, useMusicPlayer, type YTPlayer } from '@/lib/music/musicPlayerContext';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { createMsrAudioEngine, PLAYER_STATE, type PlaybackEngine } from '@/lib/music/playbackEngine';
import { songAllowed } from '@/lib/music/songFilter';
import { MAIN_AUDIO_START } from '@/lib/music/pageMusic';

type Status = 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
/** A separate page-owned engine: never borrows the main player's queue, song or clock. */
export default function PageAudio({ musicId, pageKey }: { musicId: string | null; pageKey: string }) {
  // A new page gets a fresh mute choice, including event-to-event navigation.
  return <PageAudioSession key={`${pageKey}:${musicId}`} musicId={musicId} />;
}
function PageAudioSession({ musicId }: { musicId: string | null }) {
  const enabled = useSiteSetting('backgroundMusic'), consent = usePrivacyChoice('externalMedia');
  const { isPlaying, starting, buffering, volume, excludeCopyrighted, includeEndfield } = useMusicPlayer();
  const mainBusy = isPlaying || starting || buffering;
  const busy = useRef(mainBusy), muted = useRef(false), engine = useRef<PlaybackEngine | null>(null);
  const host = useRef<HTMLDivElement>(null), attempt = useRef<() => void>(() => {});
  const [song, setSong] = useState<MusicCatalogueSong | null>(null), [status, setStatus] = useState<Status>('loading');
  const statusRef = useRef<Status>('loading'), volumeRef = useRef(volume);
  const catalogueUrl = useContentUrl()(MUSIC_CATALOGUE_PATH);
  busy.current = mainBusy; volumeRef.current = volume;
  useEffect(() => {
    if (!enabled || !consent || !musicId) return;
    setSong(null); setStatus('loading'); statusRef.current = 'loading';
    let disposed = false, release = () => {}, timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController(), container = host.current;
    const state = (value: Status) => { if (!disposed) { statusRef.current = value; setStatus(value); } };
    const permitted = () => !disposed && !busy.current && !muted.current;
    const clearWatch = () => { clearTimeout(timer); };
    const watch = () => {
      clearWatch();
      timer = setTimeout(() => {
        if (permitted() && statusRef.current !== 'playing') { state('blocked'); engine.current?.pauseVideo(); }
      }, 8000);
    };
    const blocked = () => { clearWatch(); state('blocked'); engine.current?.pauseVideo(); };
    const failed = () => { clearWatch(); state('error'); engine.current?.pauseVideo(); };
    const suspend = () => { busy.current = true; clearWatch(); engine.current?.pauseVideo(); };
    window.addEventListener(MAIN_AUDIO_START, suspend);
    const onPageHide = () => { engine.current?.pauseVideo(); };
    window.addEventListener('pagehide', onPageHide);
    void loadMusicCatalogue(catalogueUrl, abort.signal).then(async songs => {
      const track = songs.find(item => (item.id === musicId || item.cid === musicId) && songAllowed({ excludeCopyrighted, includeEndfield }, item));
      if (disposed || !track) return;
      setSong(track);
      const onState = (value: number) => {
        if (disposed) return;
        if (value === PLAYER_STATE.PLAYING) {
          if (!permitted()) { engine.current?.pauseVideo(); return; }
          clearWatch(); state('playing');
        } else if (value === PLAYER_STATE.ENDED && permitted()) {
          state('loading'); engine.current?.loadVideoById(track.id); watch();
        } else if (value === PLAYER_STATE.PAUSED && !['blocked', 'error'].includes(statusRef.current)) state('paused');
      };
      const ready = (player: PlaybackEngine) => {
        if (disposed) { player.pauseVideo(); return; }
        engine.current = player;
        player.setVolume(Math.min(volumeRef.current, 15));
        attempt.current = () => {
          if (!permitted()) return;
          const retry = statusRef.current === 'error';
          state('loading'); watch();
          if (retry) player.loadVideoById(track.id); else player.playVideo();
        };
        if (permitted()) { state('loading'); player.loadVideoById(track.id); watch(); }
        else { player.cueVideoById(track.id); state('paused'); }
      };
      if (track.videoId) {
        await loadYouTubeApi();
        if (disposed || !container) return;
        const mount = document.createElement('div');
        mount.id = 'arkpedia-page-audio'; container.appendChild(mount);
        const player = new window.YT.Player(mount, { width: '1', height: '1', playerVars: { autoplay: 0 }, events: {
          onReady: (event: { target: YTPlayer }) => ready(event.target),
          onStateChange: (event: { data: number }) => onState(event.data), onError: failed, onAutoplayBlocked: blocked,
        } }) as YTPlayer & { destroy?: () => void };
        release = () => { player.pauseVideo?.(); player.destroy?.(); mount.remove(); };
      } else {
        // A distinct element prevents this fallback from touching paused main-player audio.
        const element = document.createElement('audio'); element.preload = 'none';
        const player = createMsrAudioEngine({ onState, onError: failed, onAutoplayBlocked: blocked, onStuck: failed }, { element });
        release = () => { player.stop(); element.remove(); };
        ready(player);
      }
    }).catch(() => { if (!disposed) state('error'); });
    return () => {
      disposed = true; abort.abort(); clearWatch(); release(); engine.current = null; attempt.current = () => {};
      window.removeEventListener(MAIN_AUDIO_START, suspend); window.removeEventListener('pagehide', onPageHide);
      container?.replaceChildren();
    };
  }, [enabled, consent, musicId, catalogueUrl, excludeCopyrighted, includeEndfield]);
  useEffect(() => {
    busy.current = mainBusy;
    if (mainBusy) engine.current?.pauseVideo();
    else if (!muted.current) attempt.current();
  }, [mainBusy]);
  useEffect(() => { engine.current?.setVolume(Math.min(volume, 15)); }, [volume]);
  if (!enabled || !consent || !musicId) return null;
  const playing = status === 'playing';
  return <div className="page-audio-controls">
    <div className="music-hidden-frame" ref={host} aria-hidden="true" />
    {song && !mainBusy && <button type="button" className="ghost btn-sm" title={song.altTitle || song.title}
      aria-label={playing || status === 'loading' ? 'Mute page music' : 'Play page music'} onClick={() => {
        if (playing || status === 'loading') { muted.current = true; engine.current?.pauseVideo(); setStatus('paused'); statusRef.current = 'paused'; }
        else { muted.current = false; attempt.current(); }
      }}>{playing ? 'Mute page music' : status === 'loading' ? 'Starting page music…' : 'Play page music'}</button>}
    {song && !mainBusy && status === 'error' && <span role="status">Couldn’t play this theme. Try Play again.</span>}
  </div>;
}
