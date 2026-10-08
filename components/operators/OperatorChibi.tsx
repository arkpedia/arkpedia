import { useState } from 'react';
import dynamic from 'next/dynamic';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { ChibiFacings } from '@/lib/operators/chibi';
const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });
export default function OperatorChibi({ models, label, onOpen }: { onOpen?: () => void; models: ChibiFacings | null; label: string }) {
  const [open, setOpen] = useState(false), [facing, setFacing] = useState<'front' | 'back'>('front');
  const options = (['front', 'back'] as const).filter(value => models?.[value]).map(value => ({ value, label: value === 'front' ? 'Front' : 'Back' }));
  const shown = models?.[facing] ? facing : options[0]?.value;
  return <div className="operator-chibi"><button className="ghost" type="button" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>Chibi viewer</button>
    {open && (shown && models?.[shown] ? <><SegmentedControl label="Chibi facing" value={shown} options={options} onChange={setFacing} /><ChibiCanvas key={`${label}-${shown}`} model={models[shown]!} label={label} /></> : <p className="hint">Chibi artwork for this outfit is not in the current asset catalogue.</p>)}
  </div>;
}
