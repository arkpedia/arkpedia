import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import CountdownTimer from '../ui/CountdownTimer';
import { GachaBannerWithWindow } from '@/lib/home/frontPageContent';
import { isBannerLive } from '@/lib/gacha/upcomingBanners';
import { windowCountdown } from '@/lib/schedule/gameWindow';
import { formatCountdown } from '@/lib/maps/mapProjection';
import { useReaderClock } from '@/lib/time/readerClock';

interface Props {
  banners: GachaBannerWithWindow[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** The request's clock (epoch ms), from the page's contentPageClock `now`. Required: the
   *  LIVE and "Starts in" badges render from it on the server and in the first client paint,
   *  which must agree, and from the reader's clock once mounted (lib/time/readerClock.ts). */
  now: number;
}

type BannerState = { kind: 'live' } | { kind: 'upcoming'; startsIn: string } | null;

/** Where a banner stands at `clock`. Live is isBannerLive, the test /gacha's LIVE NOW badge
 *  uses; "Starts in" is windowCountdown's label, the one CountdownTimer shows under the
 *  poster; the time left is formatCountdown's, the map tooltip's ("20d 5h", "5h 12m"). Over
 *  (a tab left open past a banner's end) is neither. */
function bannerState(banner: GachaBannerWithWindow, clock: number): BannerState {
  if (isBannerLive(banner, clock)) return { kind: 'live' };
  if (windowCountdown(banner.start, banner.end, new Date(clock)).label !== 'Starts in') return null;
  return { kind: 'upcoming', startsIn: formatCountdown(banner.start.toISOString(), clock) };
}

/** The site's one live badge (.badge-live) and its amber "Starts in" twin (.badge-upcoming),
 *  both drawn in arkpedia-theme.css; front.css only places them over the art. On a compact
 *  thumbnail the countdown is its largest unit ("in 20d"): the whole of it is the poster's. */
function StateBadge({ state, compact = false }: { state: BannerState; compact?: boolean }) {
  if (!state) return null;
  if (state.kind === 'live') return <span className="badge-live">LIVE</span>;
  return <span className="badge-upcoming">{compact ? `in ${state.startsIn.split(' ')[0]}` : `Starts in ${state.startsIn}`}</span>;
}

/** The thumbnail's accessible name: the banner, and whether it is live or when it opens. */
function thumbLabel(name: string, state: BannerState): string {
  if (!state) return name;
  return state.kind === 'live' ? `${name}, live now` : `${name}, starts in ${state.startsIn}`;
}

export default function GachaBannersPanel({ banners, activeIndex, onSelect, now }: Props) {
  // The request's clock first, so the markup and the first client paint agree; the reader's
  // after mount, re-read each minute and on focus (a tab left open sees a banner open or end),
  // as /gacha reads it for its LIVE NOW.
  const clock = useReaderClock(now, { tickMs: 60_000, onFocus: true });

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
        <Link prefetch={false} href={`/gacha-simulator?banner=${encodeURIComponent(active.name)}`} className="front-gacha-poster-wrap">
          {/* The home page's hero on a phone (its LCP at 390): the first banner is fetched
              at once and first, and a banner picked later comes in on screen. Without art
              yet (null until the image repository publishes it), /gacha's placeholder. */}
          {active.banner_image
            ? <Image src={active.banner_image} alt={bannerDisplayName(active.name)} fill sizes="600px" style={{ objectFit: 'contain' }} priority={activeIndex === 0} />
            : <span className="art-placeholder front-gacha-art-placeholder">No art yet</span>}
          <StateBadge state={bannerState(active, clock)} />
        </Link>
        <div className="front-gacha-info">
          <span className="front-gacha-name">{bannerDisplayName(active.name)}</span>
          <CountdownTimer start={active.start} target={active.end} />
        </div>
      </div>

      {banners.length > 1 && (
        <div className="front-gacha-thumbs">
          {banners.map((b, i) => {
            const state = bannerState(b, clock);
            return (
              <button
                type="button"
                key={b.name}
                className={`front-gacha-thumb${i === activeIndex ? ' active' : ''}`}
                onClick={() => onSelect(i)}
                title={thumbLabel(bannerDisplayName(b.name), state)}
                aria-label={thumbLabel(bannerDisplayName(b.name), state)}
              >
                {b.banner_image ? (
                  /* Request enough source width for the landscape preview's cover
                     crop; a tiny rendition becomes blurry when scaled to its height. */
                  <Image src={b.banner_image} alt="" width={192} height={61} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span className="art-placeholder" aria-hidden="true">No art</span>
                )}
                <StateBadge state={state} compact />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
