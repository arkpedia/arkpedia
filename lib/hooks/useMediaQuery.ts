import { useEffect, useState } from 'react';

/**
 * Whether a media query matches, live. False on the server and on the first client
 * render, so the markup hydrates identically; the real answer lands in an effect.
 * For choices that only matter once the reader interacts (which way a suggestion
 * list opens), never for layout that is visible on first paint -- use CSS for that.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
