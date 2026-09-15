import { useEffect, useRef, useState } from 'react';

const HOLD_DURATION_MS = 8000;
const FADE_DURATION_MS = 400; // must match the CSS transition duration on .music-crossfade-text

/** Cross-fades between a song's title and its (translated) alt title,
 * holding each for 8 seconds -- only when they're actually different;
 * if there's no alt title, or it's identical to the title, this just
 * returns the title as-is with no fading at all. `fading` goes true
 * for the brief FADE_DURATION_MS window in the middle of each swap --
 * consumers apply a `.fading` class during that window (opacity: 0 via
 * CSS transition) and swap back once it clears, producing an actual
 * fade rather than an instant text change. */
export function useCrossFadeTitle(title: string, altTitle?: string | null) {
  const shouldFade = Boolean(altTitle && altTitle !== title);
  const [displayName, setDisplayName] = useState(title);
  const [fading, setFading] = useState(false);
  const showingAltRef = useRef(false);

  useEffect(() => {
    showingAltRef.current = false;
    setDisplayName(title);
    setFading(false);
    if (!shouldFade) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const intervalId = setInterval(() => {
      setFading(true);
      timeoutId = setTimeout(() => {
        showingAltRef.current = !showingAltRef.current;
        setDisplayName(showingAltRef.current ? (altTitle as string) : title);
        setFading(false);
      }, FADE_DURATION_MS);
    }, HOLD_DURATION_MS);

    return () => {
      clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFade, title, altTitle]);

  return { displayName, fading };
}