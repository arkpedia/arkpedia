import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import dynamic from 'next/dynamic';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import { useRoamingChibi } from './RoamingChibiProvider';
import type { ChibiFacings } from '@/lib/operators/chibi';
const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });

export default function OperatorChibi({ models, label, onOpen }: { onOpen?: () => void; models: ChibiFacings | null; label: string }) {
  const [open, setOpen] = useState(false), [facing, setFacing] = useState<'front' | 'back'>('front');
  const [animation, setAnimation] = useState('Idle'), [animations, setAnimations] = useState<string[]>([]);
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const panelRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const roamingChibi = useRoamingChibi();
  const roaming = roamingChibi.pet?.label === label;
  const currentPaused = roaming ? roamingChibi.pet!.paused : paused;
  useEffect(() => { if (roaming) setPaused(currentPaused); }, [roaming, currentPaused]);
  const options = (['front', 'back'] as const).filter(value => models?.[value]).map(value => ({ value, label: value === 'front' ? 'Front' : 'Back' }));
  const shown = models?.[facing] ? facing : options[0]?.value;
  const model = shown ? models?.[shown] : undefined;
  const walkingModel = models?.walk ?? model;
  const pet = () => walkingModel ? { label, model: walkingModel, paused: currentPaused, returnFocus: triggerRef.current } : null;
  const startWalking = () => {
    const next = pet(); if (!next) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    roamingChibi.walkOnPage(next, { x: (bounds?.left ?? window.innerWidth / 2) - 160, y: bounds?.top ?? window.innerHeight / 2 });
  };
  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const next = pet(); if (next) roamingChibi.startDrag(event, next);
  };
  // Only the inline canvas remounts on a facing change. The app owns the detached canvas.
  const canvas = model ? <ChibiCanvas key={model.skeleton} model={model} label={label} animation={animation} onAnimationChange={setAnimation}
    onAnimationsChange={setAnimations} paused={paused} moving={false} flipped={false} onPointerDown={startDrag} roaming={false} /> : null;
  return <div className="operator-chibi" ref={panelRef}>
    <div className="operator-chibi-header">
      <button ref={triggerRef} className="ghost" type="button" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>Chibi viewer</button>
      {open && shown && <SegmentedControl label="Chibi facing" value={shown} options={options} onChange={setFacing} />}
    </div>
    {open && (roaming ? <div className="chibi-away"><button className="ghost" type="button" onClick={roamingChibi.dismiss}>Return to viewer</button></div>
      : canvas ?? <p className="hint">Chibi artwork for this outfit is not in the current asset catalogue.</p>)}
    {open && (canvas || roaming) && <>
      <div className="chibi-controls">
        <StyledSelect className="chibi-animation" label="Chibi animation" value={animation} options={animations.map(value => ({ value, label: value }))} onChange={setAnimation} />
        <button type="button" className="ghost" aria-pressed={currentPaused} onClick={() => { setPaused(!currentPaused); if (roaming) roamingChibi.setPaused(!currentPaused); }}>{currentPaused ? 'Play' : 'Pause'}</button>
      </div>
      {!roaming && <div className="chibi-page-controls"><button className="ghost" type="button" onClick={startWalking}>Walk on page</button></div>}
    </>}
  </div>;
}
