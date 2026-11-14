import { useEffect, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { loadYouTubeApi, useMusicPlayer, type YTPlayer } from '@/lib/music/musicPlayerContext';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { createMsrAudioEngine, PLAYER_STATE, type PlaybackEngine } from '@/lib/music/playbackEngine';
import { songAllowed } from '@/lib/music/songFilter';
import { MAIN_AUDIO_START } from '@/lib/music/pageMusic';
import { songTitle } from '@/lib/music/musicPolish';
import { publishPagePlayback, clearPagePlayback } from '@/lib/music/pageAudioPlayback';
import { useEventEntranceAudioHold } from '@/lib/events/eventEntranceContext';
import { msrTrackId } from '@/lib/music/trackId';
import { msrAudioAddress } from '@/lib/music/audioElement';
import { audioLinkExpiry } from '@/lib/music/monsterSirenAudio';

type Status = 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
/** A separate page-owned engine: never borrows the main player's queue, song or clock. */
type AudioPreference = 'backgroundMusic' | 'eventMusic';
export default function PageAudio({ musicId, pageKey, preference, allowEndfield = false }: { musicId: string | null; pageKey: string; preference: AudioPreference; allowEndfield?: boolean }) {
  // Each page owns its engine; the enabled setting persists across navigation.
  return <PageAudioSession key={`${pageKey}:${musicId}`} musicId={musicId} preference={preference} allowEndfield={allowEndfield} />;
}
function PageAudioSession({ musicId, preference, allowEndfield }: { musicId: string | null; preference: AudioPreference; allowEndfield: boolean }) {
  const enabled = useSiteSetting(preference), consent = usePrivacyChoice('externalMedia');
  const { isPlaying, starting, buffering, volume, excludeCopyrighted, includeEndfield, dataSaver } = useMusicPlayer();
  const entranceHold = useEventEntranceAudioHold();
  const mainBusy = isPlaying || starting || buffering || entranceHold;
  const owner = useRef({});
  const busy = useRef(mainBusy), engine = useRef<PlaybackEngine | null>(null);
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
    const permitted = () => !disposed && !busy.current;
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
      const track = songs.find(item => (item.id === musicId || item.cid === musicId) && songAllowed({ excludeCopyrighted, includeEndfield: includeEndfield || allowEndfield }, item));
      if (disposed || !track) return;
      setSong(track);
      // Follow the main player's source choice: official audio by default,
      // YouTube for video-only recordings or the reader's Data saver choice.
      const native = Boolean(track.cid && (!track.videoId || !dataSaver));
      const playbackId = native ? msrTrackId(track.cid!) : track.id;
      const onState = (value: number) => {
        if (disposed) return;
        if (value === PLAYER_STATE.PLAYING) {
          if (!permitted()) { engine.current?.pauseVideo(); return; }
          clearWatch(); state('playing');
        } else if (value === PLAYER_STATE.ENDED && permitted()) {
          state('loading'); engine.current?.loadVideoById(playbackId); watch();
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
          if (retry) player.loadVideoById(playbackId); else player.playVideo();
        };
        if (permitted()) { state('loading'); player.loadVideoById(playbackId); watch(); }
        else { player.cueVideoById(playbackId); state('paused'); }
      };
      if (!native && track.videoId) {
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
        let preparedAddress: string | undefined;
        const usable = (url: string | undefined) => url && (audioLinkExpiry(url, Date.now()) ?? 0) - Date.now() >= 70 * 60_000;
        if (busy.current && track.cid) {
          // Resolve the signed address under the intro, without playing or
          // borrowing the personal queue's preloader. The handoff skips the API.
          void fetch(msrAudioAddress(track.cid), { method: 'HEAD', signal: abort.signal, credentials: 'omit' })
            .then(response => { if (!disposed && response.ok && usable(response.url)) preparedAddress = response.url; })
            .catch(() => { /* Ordinary streaming remains available. */ });
        }
        const player = createMsrAudioEngine({ onState, onError: failed, onAutoplayBlocked: blocked, onStuck: failed }, {
          element, address: (cid, fresh) => !fresh && usable(preparedAddress) ? preparedAddress! : msrAudioAddress(cid, fresh),
        });
        release = () => { player.stop(); element.remove(); };
        ready(player);
      }
    }).catch(() => { if (!disposed) state('error'); });
    return () => {
      disposed = true; abort.abort(); clearWatch(); release(); engine.current = null; attempt.current = () => {};
      window.removeEventListener(MAIN_AUDIO_START, suspend); window.removeEventListener('pagehide', onPageHide);
      container?.replaceChildren();
    };
  }, [enabled, consent, musicId, catalogueUrl, excludeCopyrighted, includeEndfield, allowEndfield, dataSaver]);
  useEffect(() => {
    busy.current = mainBusy;
    if (mainBusy) engine.current?.pauseVideo();
    else attempt.current();
  }, [mainBusy]);
  useEffect(() => { engine.current?.setVolume(Math.min(volume, 15)); }, [volume]);
  useEffect(() => {
    const identity = owner.current;
    if (enabled && consent && song) publishPagePlayback({ owner: identity,
      title: songTitle(song.title, song.altTitle), status: mainBusy ? 'paused' : status,
      needsPlay: !mainBusy && (status === 'blocked' || status === 'error'),
      play: () => attempt.current(),
    });
    return () => clearPagePlayback(identity);
  }, [enabled, consent, song, status, mainBusy]);
  if (!enabled || !consent || !musicId) return null;
  return <div className="music-hidden-frame" data-page-audio={status} ref={host} aria-hidden="true" />;
}
