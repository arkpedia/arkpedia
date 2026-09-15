import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from './PriceDisplay';
import SkinZoomOverlay from './SkinZoomOverlay';

export default function SkinsCarousel({ skins }: { skins: Skin[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [active, setActive] = useState<Skin | null>(null);
  const [zooming, setZooming] = useState(false);

  useEffect(() => {
    if (!active) setZooming(false);
  }, [active]);

  useEffect(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) return;

    function checkOverflow() {
      if (!track || !container) return;
      setNeedsScroll(track.scrollWidth > container.clientWidth);
    }

    checkOverflow();

    // ResizeObserver (not just a window resize listener) is what
    // actually fixes this -- skin thumbnails load asynchronously via
    // next/image, so on a slow connection the track's real width isn't
    // final yet at the moment checkOverflow() first runs. A plain
    // window-resize listener never re-fires just because images
    // finished loading (the window itself didn't resize), so
    // needsScroll could get stuck at its initial (wrong) reading.
    // ResizeObserver fires whenever the observed element's own
    // rendered size actually changes, for any reason, including image
    // loads growing the track -- which is exactly the case that was
    // silently failing on mobile.
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(track);
    resizeObserver.observe(container);
    window.addEventListener('resize', checkOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [skins]);

  if (skins.length === 0) {
    return (
      <section className="front-panel front-skins-panel">
        <h2>Skins</h2>
        <p className="hint">No ongoing skins right now.</p>
      </section>
    );
  }

  const displaySkins = needsScroll ? [...skins, ...skins] : skins;

  return (
    <section className="front-panel front-skins-panel">
      <h2>Skins</h2>
      <div className="front-skins-viewport" ref={containerRef}>
        <div className={`front-skins-track${needsScroll ? ' scrolling' : ' static'}`} ref={trackRef}>
          {displaySkins.map((skin, i) => {
            const prices = parsePrices(skin.howToObtain);
            return (
              <button
                type="button"
                className="front-skin-item"
                key={`${skin.name}-${i}`}
                onClick={() => setActive(skin)}
              >
                {/* Requested at twice the box: the art is 900-2048px and cover
                    crops into it, so a 128px optimizer rendition re-enlarged by the
                    crop was mush on any screen. */}
                {skin.image && <Image src={skin.image} alt={skin.name} width={240} height={320} quality={85} style={{ objectFit: 'cover', width: 120, height: 160 }} />}
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
        </div>
      </div>

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
                  <Image
                    src={active.image}
                    alt={active.name}
                    width={1600}
                    height={900}
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