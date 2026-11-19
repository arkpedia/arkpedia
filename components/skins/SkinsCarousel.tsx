import { useState } from 'react';
import Link from 'next/link';
import { Skin } from '@/lib/skins/skinTypes';
import SkinDetailDialog from './SkinDetailDialog';
import SkinShelf from './SkinShelf';

export default function SkinsCarousel({ skins }: { skins: Skin[] }) {
  const [active, setActive] = useState<Skin | null>(null);
  return (
    <section className="front-panel front-home-panel front-skins-panel">
      {skins.length ? (
        <SkinShelf skins={skins} label="Skins on sale" active={!active} onOpen={setActive} />
      ) : <>
        <h2 className="section-title">Skins</h2>
        <p className="hint">No ongoing skins right now.</p>
      </>}

      {active && <SkinDetailDialog skin={active} onClose={() => setActive(null)}
        footer={<Link prefetch={false} href={`/skins?skin=${encodeURIComponent(active.name)}`}>View in outfit gallery</Link>} />}

    </section>
  );
}
