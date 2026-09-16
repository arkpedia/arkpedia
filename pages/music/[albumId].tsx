import { useEffect } from 'react';
import { useRouter } from 'next/router';

// This route used to export a stale copy of the mini player
// (components/music/MusicPlayer.tsx) as its own page -- a leftover from
// before the full player experience moved to /music. Despite the
// [albumId] name it never fetched any album data (no getStaticProps
// at all), nothing in the codebase links here, and its private copy
// of the player had already drifted behind the real component (no
// title cross-fade, no `starting` state, an extra shuffle/repeat row
// the real widget dropped). Rather than keep a dead duplicate limping
// along, any stray visit -- an old bookmark, a link shared before the
// restructure -- lands on the real player instead.
export default function AlbumRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/music');
  }, [router]);
  return null;
}
