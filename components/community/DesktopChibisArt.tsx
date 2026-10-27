import { useState } from 'react';
import ChibiCanvas from '@/components/operators/ChibiCanvas';
import type { ChibiModel } from '@/lib/operators/chibi';

const noAnimations = () => {};
const noPointer = () => {};
function Companion({ model, name }: { model: ChibiModel; name: string }) {
  const [animation, setAnimation] = useState('');
  return <ChibiCanvas model={model} label={name} animation={animation} onAnimationChange={setAnimation}
    onAnimationsChange={noAnimations} paused moving={false} flipped={false} roaming={false} onPointerDown={noPointer} />;
}

/** Real companion models, using the same renderer as the desktop app. */
export default function DesktopChibisArt({ models }: { models: { name: string; model: ChibiModel }[] }) {
  return <div className="community-project-desktop" aria-hidden="true">
    <div className="community-project-window"><span /><span /><span /></div>
    <div className="community-project-companions">{models.map(entry => <Companion key={entry.name} {...entry} />)}</div>
  </div>;
}
