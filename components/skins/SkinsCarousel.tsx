import { useState } from 'react';
import Link from 'next/link';
import { Skin } from '@/lib/skins/skinTypes';
import SkinDetailDialog from './SkinDetailDialog';
import SkinShelf from './SkinShelf';

export default function SkinsCarousel({ skins }: { skins: Skin[] }) {
  const [active, setActive] = useState<Skin | null>(null);
  return (
    <section className="front-panel front-home-panel front-skins-panel">
      <SkinShelf skins={skins} label="Skins on sale" empty="No ongoing skins right now." active={!active} onOpen={setActive} />

      {active && <SkinDetailDialog skin={active} onClose={() => setActive(null)}
        footer={<Link prefetch={false} href={`/skins?skin=${encodeURIComponent(active.name)}`}>View in outfit gallery</Link>} />}

    </section>
  );
}
