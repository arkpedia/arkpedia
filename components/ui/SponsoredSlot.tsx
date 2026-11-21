import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ContentImg } from '@/components/content/ContentImage';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import { ContentTablesContext, useContentUrl } from '@/lib/content/context';
import { sitePath, sponsorCampaignsFor, type SponsorCampaign, type SponsorCampaignTable, type SponsorSlot } from '@/lib/sponsors/campaigns';
import { SPONSOR_STRINGS as S } from '@/lib/sponsors/strings';

/* Draft campaigns show in `next dev` and on the Preview site (ARKPEDIA_PREVIEW, which
   next.config.js sets for the staging build role), never on the public site. */
const DRAFTS = process.env.NODE_ENV !== 'production' || process.env.ARKPEDIA_PREVIEW === '1';

/** Largest timeout supported by browsers, in ms. Recheck when a boundary is further away. */
const MAX_TIMER_MS = 2_147_483_647;

function useSponsorCampaigns(placement: SponsorSlot): SponsorCampaign[] {
  const table = useContext(ContentTablesContext)['sponsor-campaigns'] as SponsorCampaignTable | undefined;
  const [readerClock, setReaderClock] = useState<{ table: SponsorCampaignTable; now: number } | null>(null);
  useEffect(() => {
    if (!table) return;
    const boundaries = sponsorCampaignsFor(table, placement, null, DRAFTS)
      .filter(campaign => campaign.status === 'active')
      .flatMap(({ startAt, endAt }) => [startAt, endAt].flatMap(date => date === null ? [] : [Date.parse(date)]))
      .sort((left, right) => left - right);
    if (!boundaries.length) return;

    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setReaderClock({ table, now });
      const next = boundaries.find(boundary => boundary > now);
      if (next !== undefined) timer = window.setTimeout(update, Math.min(next - now, MAX_TIMER_MS));
    };
    update();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [table, placement]);

  // Match the server through hydration, then update at the campaign boundaries.
  const now = readerClock && readerClock.table === table ? readerClock.now : table?.now ?? null;
  return useMemo(() => table ? sponsorCampaignsFor(table, placement, now, DRAFTS) : [], [table, placement, now]);
}
/** The first available campaign, if any. */
export function useSponsorCampaign(placement: SponsorSlot): SponsorCampaign | null {
  return useSponsorCampaigns(placement)[0] ?? null;
}

/** How long each campaign shows where a placement has more than one. */
const TURN_MS = 8000;

/**
 * Whose turn it is, where a placement has several campaigns: the first on the server and at
 * hydration, then the next every TURN_MS. It waits while the pointer or the keyboard focus is
 * on the slot and while the tab is hidden, and never turns for a reader who asked for reduced
 * motion. The next campaign's image is fetched ahead of its turn so the change is not a blank.
 */
function useTurn(ref: React.RefObject<HTMLElement | null>, campaigns: SponsorCampaign[]): SponsorCampaign | null {
  const [turn, setTurn] = useState(0);
  const contentUrl = useContentUrl();
  const count = campaigns.length;
  useEffect(() => {
    const slot = ref.current;
    if (count < 2 || !slot || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const next = campaigns[(turn + 1) % count];
    // Ahead of its turn; a failure here is not an error, the slot's own image shows its fallback.
    void loadAssetImage(next.image.startsWith('https://') ? next.image : contentUrl(next.image)).catch(() => {});
    const timer = window.setInterval(() => {
      if (document.hidden || slot.matches(':hover, :focus-within') || getComputedStyle(slot).display === 'none') return;
      setTurn(value => (value + 1) % count);
    }, TURN_MS);
    return () => window.clearInterval(timer);
  }, [ref, campaigns, count, turn, contentUrl]);
  return campaigns[turn % Math.max(count, 1)] ?? null;
}

/** One image and link. The page header reserves a fixed desktop slot. Other placements
 * reserve space using the first campaign's artwork dimensions. */
export default function SponsoredSlot({ placement, className = '' }: { placement: SponsorSlot; className?: string }) {
  const inMobileMenu = placement === 'mobile-menu';
  // Beside a title (and in the phone menu) the campaigns take turns; elsewhere the first shows.
  const all = useSponsorCampaigns(placement);
  const turning = placement === 'header' || inMobileMenu;
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const first = all[0] ?? null;
  const shown = useTurn(ref, turning ? all : all.slice(0, 1));
  const campaign = shown ?? first;
  if (!campaign || !first) return null;
  // The box keeps the first campaign's shape through every turn, so a turn moves nothing.
  const ratio = first.width / first.height;
  const own = sitePath(campaign.url);
  const box = placement === 'header' ? undefined : {
    aspectRatio: ratio,
    maxWidth: first.width,
    ...(inMobileMenu && { '--sponsored-menu-ratio': ratio }),
  } as CSSProperties;
  const art = failed === campaign.image
    ? <span className="sponsored-slot-fallback">{S.fallback(campaign.sponsor)}</span>
    : <ContentImg alreadyPinned={campaign.image.startsWith('https://')} src={campaign.image} alt={campaign.alt} width={campaign.width} height={campaign.height} referrerPolicy="no-referrer" onError={() => setFailed(campaign.image)} />;
  // Arkpedia's own banner is not an advertisement: no "Ad" tag, and it opens in this tab.
  const tag = own ? null : <span className="sponsored-slot-tag">{S.tag}</span>;
  return (
    <aside ref={ref} className={`sponsored-slot sponsored-slot--${placement} ${className}`.trim()} aria-label={own ? S.ownRegion : S.region(campaign.sponsor)} data-sponsor-campaign={campaign.id}>
      {own ? (
        <Link key={campaign.id} className="sponsored-slot-art" style={box} href={campaign.url!} prefetch={false} aria-label={S.ownLinkLabel(campaign.alt)}>
          {art}
        </Link>
      ) : campaign.url ? (
        <a key={campaign.id} className="sponsored-slot-art" style={box} href={campaign.url} target="_blank" rel="sponsored noopener noreferrer" aria-label={S.linkLabel(campaign.sponsor, campaign.alt)}>
          {art}{tag}
        </a>
      ) : (
        <div key={campaign.id} className="sponsored-slot-art" style={box}>{art}{tag}</div>
      )}
    </aside>
  );
}
