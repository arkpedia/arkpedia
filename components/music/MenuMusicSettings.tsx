import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { useContentUrl } from '@/lib/content/context';
import { setSetting, type SiteSettings } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { accountMenuMusic } from '@/lib/music/menuMusic';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { createSongIndex } from '@/lib/music/songSearch';
import { gameSearchNames } from '@/lib/music/songFilter';
import { songTitle } from '@/lib/music/musicPolish';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import styles from './MenuMusicSettings.module.css';

export default function MenuMusicSettings() {
  const source = useSiteSetting('menuMusicSource'), custom = useSiteSetting('menuMusicTrack');
  const account = useAccount(), { excludeCopyrighted } = useMusicPlayer();
  const url = useContentUrl()(MUSIC_CATALOGUE_PATH);
  const [songs, setSongs] = useState<MusicCatalogueSong[]>([]), [query, setQuery] = useState('');
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(false); setSongs([]);
    void loadMusicCatalogue(url, abort.signal).then(setSongs).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [url, attempt]);
  const index = useMemo(() => createSongIndex(songs, song => ({ ...song, extra: gameSearchNames(song.game) })), [songs]);
  const matches = useMemo(() => index.search(query).filter(song => !excludeCopyrighted || !song.copyright).slice(0, 20), [index, query, excludeCopyrighted]);
  const selected = songs.find(song => song.id === custom);
  const accountId = accountMenuMusic(account?.homeBackground);
  const accountSong = songs.find(song => song.cid === accountId);
  const title = (song: MusicCatalogueSong) => songTitle(song.title, song.altTitle);
  return <div className={styles.settings}>
    <StyledSelect label="Menu theme source" value={source} onChange={value => setSetting('menuMusicSource', value as SiteSettings['menuMusicSource'])}
      options={[{ value: 'default', label: 'Default theme' }, { value: 'account', label: 'Imported account theme' }, { value: 'custom', label: 'Custom song' }]} />
    {source === 'account' && <p role="status">{accountSong ? title(accountSong) : !account?.homeBackground
      ? 'Import your game account to read its home theme. Using the default for now.'
      : 'This account theme has no available recording yet. Using the default for now.'}</p>}
    {source === 'custom' && <>
      <SearchInput className={styles.picker} label="Choose menu song" value={query} onChange={setQuery} placeholder="Search songs, albums, artists or Endfield…"
        suggestions={matches} getKey={song => song.id} suggestLabel="Matching menu songs" emptyText={error ? 'Could not load songs.' : songs.length ? 'No matching songs.' : 'Loading songs…'}
        renderSuggestion={song => <span>{title(song)}{song.game === 'endfield' ? ' · Endfield' : ''}{song.artist ? ` · ${song.artist}` : ''}</span>}
        onPick={song => { setSetting('menuMusicTrack', song.id); setQuery(''); }} />
      <p role="status">{selected ? `Selected: ${title(selected)}` : custom ? 'Selected song is unavailable in this catalogue.' : 'Choose a song. Using the default until then.'}</p>
      {selected?.copyright && excludeCopyrighted && <p>Stream-safe mode prevents this song from playing.</p>}
    </>}
    {error && <button type="button" className="ghost btn-sm" onClick={() => setAttempt(value => value + 1)}>Retry loading songs</button>}
    <p className="hint">Event pages use their own music. Your music player always takes priority. A chosen Endfield song can play here even when Endfield is hidden from the player.</p>
  </div>;
}
