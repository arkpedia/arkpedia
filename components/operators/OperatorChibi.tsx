import type { OperatorVoiceData } from '@/lib/operators/operatorVoices';
import { chibiTapVoices } from '@/lib/operators/chibiVoice';
import { useEffect, useMemo, useRef } from 'react';
import { useRoamingChibi } from './RoamingChibiProvider';
import type { ChibiFacings } from '@/lib/operators/chibi';

export default function OperatorChibi({ models, label, onOpen, voiceData, appearance }: { voiceData?: OperatorVoiceData | null; appearance: string; onOpen?: () => void; models: ChibiFacings | null; label: string }) {
  const voices = useMemo(() => chibiTapVoices(voiceData, appearance), [voiceData, appearance]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { viewer, viewerOpen, openViewer, closeViewer } = useRoamingChibi();
  const open = viewerOpen && viewer?.label === label;
  // Artwork changes finish asynchronously; keep a viewer opened here on that outfit.
  useEffect(() => {
    if (viewerOpen && viewer?.returnFocus === triggerRef.current && viewer.label !== label) {
      openViewer({ models: models ?? {}, label, voices, returnFocus: triggerRef.current });
    }
  }, [models, label, viewer, viewerOpen, openViewer, voices]);
  return <div className="operator-chibi">
    <button ref={triggerRef} className="ghost" type="button" aria-label="Chibi viewer" aria-expanded={open} onClick={() => {
      if (open) closeViewer();
      else { onOpen?.(); openViewer({ models: models ?? {}, label, voices, returnFocus: triggerRef.current }); }
    }}>Chibi</button>
  </div>;
}
