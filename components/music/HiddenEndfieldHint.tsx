import { useMusicPlayer } from '@/lib/music/musicPlayerContext';

/**
 * What a search found and the Endfield music setting hides (lib/music/songFilter.ts): how many
 * Endfield songs matched, and a button that turns the setting on. Discover and the Library show
 * it over their results, so a search for one of those songs (or for "endfield") never reads as
 * finding nothing.
 */
export default function HiddenEndfieldHint({ count }: { count: number }) {
  const { setIncludeEndfield } = useMusicPlayer();
  if (count <= 0) return null;
  return (
    <p className="hint music-hidden-endfield-hint" role="status">
      {count} Arknights: Endfield song{count === 1 ? '' : 's'} {count === 1 ? 'matches' : 'match'}, hidden while Endfield music is off.{' '}
      <button type="button" className="ghost btn-sm" onClick={() => setIncludeEndfield(true)}>Include Endfield music</button>
    </p>
  );
}
