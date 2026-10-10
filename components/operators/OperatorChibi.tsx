import { useEffect, useRef } from 'react';
import { useRoamingChibi } from './RoamingChibiProvider';
import type { ChibiFacings } from '@/lib/operators/chibi';

export default function OperatorChibi({ models, label, onOpen }: { onOpen?: () => void; models: ChibiFacings | null; label: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { viewer, viewerOpen, openViewer, closeViewer } = useRoamingChibi();
  const open = viewerOpen && viewer?.label === label;
  // Artwork changes finish asynchronously; keep a viewer opened here on that outfit.
  useEffect(() => {
    if (viewerOpen && viewer?.returnFocus === triggerRef.current && viewer.label !== label && models) {
      openViewer({ models, label, returnFocus: triggerRef.current });
    }
  }, [models, label, viewer, viewerOpen, openViewer]);
  return <div className="operator-chibi">
    <button ref={triggerRef} className="ghost" type="button" aria-label="Chibi viewer" aria-expanded={open} onClick={() => {
      if (open) closeViewer();
      else if (models) { onOpen?.(); openViewer({ models, label, returnFocus: triggerRef.current }); }
    }}>Chibi</button>
  </div>;
}
