import Image from 'next/image';
import Link from 'next/link';
import CountdownTimer from './CountdownTimer';
import { GachaBannerWithWindow } from '@/lib/frontPageContent';

interface Props {
  banners: GachaBannerWithWindow[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export default function GachaBannersPanel({ banners, activeIndex, onSelect }: Props) {
  if (banners.length === 0) {
    return (
      <section className="front-panel front-gacha-panel">
        <h2>Gacha Banners</h2>
        <p className="hint">No ongoing banners right now.</p>
      </section>
    );
  }

  const active = banners[Math.min(activeIndex, banners.length - 1)];

  return (
    <section className="front-panel front-gacha-panel">
      <h2>Gacha Banners</h2>
      <div className="front-gacha-main">
        <Link prefetch={false} href={`/gacha?banner=${encodeURIComponent(active.name)}`} className="front-gacha-poster-wrap">
          {active.banner_image && <Image src={active.banner_image} alt={active.name} fill sizes="600px" style={{ objectFit: 'contain' }} />}
        </Link>
        <div className="front-gacha-info">
          <span className="front-gacha-name">{active.name}</span>
          <CountdownTimer target={active.end} label="Ends in" />
        </div>
      </div>

      {banners.length > 1 && (
        <div className="front-gacha-thumbs">
          {banners.map((b, i) => (
            <button
              type="button"
              key={b.name}
              className={`front-gacha-thumb${i === activeIndex ? ' active' : ''}`}
              onClick={() => onSelect(i)}
              title={b.name}
            >
              {b.banner_image ? (
                /* The source is a 1024x323 banner and the thumb is a square crop OUT
                   of it: asking the optimizer for 64px wide produced a 64x20 strip
                   that cover then blew up 3x to fill the box. The request has to be
                   sized for the crop, not the box -- but only just: 384 was
                   overshooting the other way, pulling an 828px rendition into a
                   52px slot on every retina visit. */
                <Image src={b.banner_image} alt={b.name} width={192} height={61} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="front-gacha-thumb-fallback">{b.name[0]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}