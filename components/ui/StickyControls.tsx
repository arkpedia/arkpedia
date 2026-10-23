import { useEffect, useRef, useState, type ReactNode } from 'react';

const bars = new Map<HTMLElement, number>();
function updateAnchorOffset() {
  if (bars.size) document.documentElement.style.setProperty('--sticky-controls-h', `${Math.max(...bars.values())}px`);
  else document.documentElement.style.removeProperty('--sticky-controls-h');
}

/** Keep a compact list toolbar below the site nav; oversized controls stay in flow. */
export default function StickyControls({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      const style = getComputedStyle(element);
      const contentHeight = height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const viewport = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
      const fits = viewport >= 480 && height > 0 && contentHeight <= 176 && height <= viewport / 4;
      setCompact(fits);
      bars.set(element, fits ? height : 0);
      updateAnchorOffset();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); bars.delete(element); updateAnchorOffset(); };
  }, []);
  return <div ref={ref} className={`sticky-controls ${className}`.trim()} data-sticky={compact}>{children}</div>;
}
