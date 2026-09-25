import { useEffect, useState } from 'react';
import Link from 'next/link';
import ScrollRow from '../ui/ScrollRow';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '../ui/PriceDisplay';
import SkinZoomOverlay from './SkinZoomOverlay';
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
  const [zooming, setZooming] = useState(false);

  useEffect(() => {
    if (!active) setZooming(false);
  }, [active]);

  if (skins.length === 0) {
    return (
      <section className="front-panel front-home-panel front-skins-panel">
        <h2>Skins</h2>
        <p className="hint">No ongoing skins right now.</p>
      </section>
    );
  }

  return (
    <section className="front-panel front-home-panel front-skins-panel">
      <h2>Skins</h2>
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

      {active && (() => {
        const activePrices = parsePrices(active.howToObtain);
        return (
        <div className="modal-overlay" onClick={() => setActive(null)}>
          <div className="modal-box skin-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-back-btn" onClick={() => setActive(null)}>
              ‹ Back
            </button>
            <div className="skin-modal-image-wrap-full">
              {active.image && (
                <button
                  type="button"
                  onClick={() => setZooming(true)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', display: 'block', width: '100%' }}
                  aria-label={`Zoom in on ${active.name}`}
                >
                  <ResponsiveSkinArtwork
                    src={active.image}
                    alt={active.name}
                    width={1600}
                    height={900}
                    sizes="90vw"
                    style={{ maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
                  />
                </button>
              )}
            </div>
            <div className="skin-modal-info">
              <div className="eyebrow">
                {active.series}
                {active.code ? ` · ${active.code}` : ''}
              </div>
              <h2>{active.model ? `${active.model} - ${active.name}` : active.name}</h2>
              {active.illustrator && <p className="hint">Illustrator: {active.illustrator}</p>}
              {active.description && <p style={{ marginTop: 10 }}>{active.description}</p>}
              {active.release && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Release: {active.release}
                </p>
              )}
              {activePrices.length > 0 && (
                <p className="hint">
                  Price: <PriceDisplay prices={activePrices} />
                </p>
              )}
              {active.howToObtain && <p className="hint">How to obtain: {active.howToObtain}</p>}
            </div>
            <div className="modal-actions">
              <Link prefetch={false} href="/skins" className="ghost">
                View all skins
              </Link>
              <button type="button" className="primary" onClick={() => setActive(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {zooming && active?.image && (
        <SkinZoomOverlay image={active.image} name={active.name} onClose={() => setZooming(false)} />
      )}
    </section>
  );
}
