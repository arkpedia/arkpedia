import { useEffect, useState } from 'react';
import Image from '@/components/content/ContentImage';

export default function CalendarEventArt({ poster, scenes, active }: { poster: string | null; scenes: string[]; active: boolean }) {
  const images = Array.from(new Set([...(poster ? [poster] : []), ...scenes]));
  const [slide, setSlide] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [paused, setPaused] = useState(false);
  const [motion, setMotion] = useState(false);
  const index = failed.has(slide) ? images.findIndex((_, i) => !failed.has(i)) : slide;
  const next = images.findIndex((_, i) => i > index && !failed.has(i));
  const following = next === -1 ? images.findIndex((_, i) => !failed.has(i)) : next;
  const rotates = motion && index !== following && following >= 0;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const update = () => setMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!active || !rotates || paused || !loaded.has(following)) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSlide(following);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [active, rotates, paused, loaded, following]);

  if (!images[index]) return null;
  return (
    <div className={`schedule-event-art${poster ? '' : ' schedule-event-art-cg'}`}>
      {images.map((src, i) => (i === index || i === slide || (active && rotates && i === following) || (rotates && loaded.has(i)) ? (
        <div key={src} className={`schedule-event-art-frame${i === index ? ' schedule-event-art-current' : ''}`}>
          <Image src={src} alt="" fill sizes="(max-width: 520px) 100vw, 520px"
            onLoad={() => setLoaded(current => current.has(i) ? current : new Set(current).add(i))}
            onError={() => setFailed(current => new Set(current).add(i))} />
        </div>
      ) : null))}
      {rotates && <button type="button" className="ghost btn-sm schedule-event-art-control" onClick={() => setPaused(!paused)}>
        {paused ? 'Play artwork' : 'Pause artwork'}
      </button>}
    </div>
  );
}
