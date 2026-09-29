import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import CountdownTimer from '../ui/CountdownTimer';
import { GachaBannerWithWindow } from '@/lib/home/frontPageContent';

interface Props {
  banners: GachaBannerWithWindow[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export default function GachaBannersPanel({ banners, activeIndex, onSelect }: Props) {
  if (banners.length === 0) {
    return (
      <section className="front-panel front-home-panel front-gacha-panel">
        <h2 className="section-title">Gacha Banners</h2>
        <p className="hint">No banners to show right now.</p>
      </section>
    );
  }

  const active = banners[Math.min(activeIndex, banners.length - 1)];

  return (
    <section className="front-panel front-home-panel front-gacha-panel">
      <h2 className="section-title">Gacha Banners</h2>
      <div className="front-gacha-main">
        <Link prefetch={false} href={`/gacha?banner=${encodeURIComponent(active.name)}`} className="front-gacha-poster-wrap">
          {/* The home page's hero on a phone (its LCP at 390): the first banner is fetched
              at once and first, and a banner picked later comes in on screen. */}
          {active.banner_image && <Image src={active.banner_image} alt={bannerDisplayName(active.name)} fill sizes="600px" style={{ objectFit: 'contain' }} priority={activeIndex === 0} />}
        </Link>
        <div className="front-gacha-info">
          <span className="front-gacha-name">{bannerDisplayName(active.name)}</span>
          <CountdownTimer start={active.start} target={active.end} />
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
              title={bannerDisplayName(b.name)}
            >
              {b.banner_image ? (
                /* The source is a 1024x323 banner and the thumb is a square crop OUT
                   of it: asking the optimizer for 64px wide produced a 64x20 strip
                   that cover then blew up 3x to fill the box. The request has to be
                   sized for the crop, not the box -- but only just: 384 was
                   overshooting the other way, pulling an 828px rendition into a
                   52px slot on every retina visit. */
                <Image src={b.banner_image} alt={bannerDisplayName(b.name)} width={192} height={61} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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