import { useState } from 'react';
import Link from 'next/link';
import ScrollRow from '../ui/ScrollRow';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '../ui/PriceDisplay';
import SkinDetailDialog from './SkinDetailDialog';
import ResponsiveSkinArtwork from './ResponsiveSkinArtwork';

/**
 * The home page's skins on sale: a row that scrolls sideways under the site's drawn
 * scrollbar, moved by the reader and nothing else.
 *
 * It was an endless marquee (a doubled track on a 30s CSS animation) that ignored
 * reduced motion, never paused, and cut cards in half at both edges -- moving
 * content with no way to stop it (WCAG 2.2.2, GE-09). The maintainers chose a manual
 * row on 2026-09-25.
 */
export default function SkinsCarousel({ skins }: { skins: Skin[] }) {
  const [active, setActive] = useState<Skin | null>(null);
  if (skins.length === 0) {
    return (
      <section className="front-panel front-home-panel front-skins-panel">
        <h2 className="section-title">Skins</h2>
        <p className="hint">No ongoing skins right now.</p>
      </section>
    );
  }

  return (
    <section className="front-panel front-home-panel front-skins-panel">
      <h2 className="section-title">Skins</h2>
      <ScrollRow label="Skins on sale" className="front-skins-row">
        {skins.map((skin) => {
          const prices = parsePrices(skin.howToObtain);
          return (
            <button
              type="button"
              className="btn-bare front-skin-item"
              key={`${skin.model ?? ''}|${skin.name}`}
              onClick={() => setActive(skin)}
            >
              {/* The browser selects the smallest prebuilt rendition that stays
                  crisp through this card's cover crop. */}
              {skin.image && <ResponsiveSkinArtwork src={skin.image} alt={skin.name} width={240} height={320} sizes="120px" style={{ objectFit: 'cover', width: 120, height: 160 }} />}
              <span className="front-skin-name">
                {skin.model ? `${skin.model} - ${skin.name}` : skin.name}
              </span>
              {prices.length > 0 && (
                <span className="front-skin-price">
                  <PriceDisplay prices={prices} />
                </span>
              )}
            </button>
          );
        })}
      </ScrollRow>

      {active && <SkinDetailDialog skin={active} onClose={() => setActive(null)}
        footer={<Link prefetch={false} href={`/skins?skin=${encodeURIComponent(active.name)}`}>View in outfit gallery</Link>} />}

    </section>
  );
}
