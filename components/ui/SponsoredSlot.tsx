import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ContentImg } from '@/components/content/ContentImage';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import { ContentTablesContext, useContentUrl } from '@/lib/content/context';
import { sitePath, sponsorCampaignsFor, type SponsorCampaign, type SponsorCampaignTable, type SponsorPlacement } from '@/lib/sponsors/campaigns';
import { SPONSOR_STRINGS as S } from '@/lib/sponsors/strings';

/* Draft campaigns show in `next dev` and on the Preview site (ARKPEDIA_PREVIEW, which
   next.config.js sets for the staging build role), never on the public site. */
const DRAFTS = process.env.NODE_ENV !== 'production' || process.env.ARKPEDIA_PREVIEW === '1';

/**
 * The campaign a placement shows now, or null.
 *
 * The server decides: withContentPage has already dropped the campaigns outside their
 * dates at the request (lib/content/server.ts), and the page shows what it was sent. The
 * reader's clock is deliberately not consulted, so a slot never appears or disappears
 * under a reader mid-visit and moves the content beside it; a campaign's start and end
 * reach a page with its next revalidation. A page that is not a content route (no
 * withContentPage) carries no table and shows nothing.
 */
export function useSponsorCampaigns(placement: SponsorPlacement): SponsorCampaign[] {
  const table = useContext(ContentTablesContext)['sponsor-campaigns'] as SponsorCampaignTable | undefined;
  return useMemo(() => table ? sponsorCampaignsFor(table, placement, null, DRAFTS) : [], [table, placement]);
}
/** The first of them: the one the server's HTML shows, and the one whose shape sizes the slot. */
export function useSponsorCampaign(placement: SponsorPlacement): SponsorCampaign | null {
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
    void loadAssetImage(contentUrl(next.image)).catch(() => {});
    const timer = window.setInterval(() => {
      if (document.hidden || slot.matches(':hover, :focus-within') || getComputedStyle(slot).display === 'none') return;
      setTurn(value => (value + 1) % count);
    }, TURN_MS);
    return () => window.clearInterval(timer);
  }, [ref, campaigns, count, turn, contentUrl]);
  return campaigns[turn % Math.max(count, 1)] ?? null;
}

/** How near the header's own text or controls may come to the slot, in px, before it stays hidden. */
const CLEARANCE = 16;

/**
 * Whether nothing else in the slot's parent reaches under it: every piece of text and every
 * childless element (an icon, an input) of its siblings, with CLEARANCE around the slot.
 * Text is measured, not its block, so a full-width paragraph with a short line is clear.
 */
function clearOfSiblings(slot: HTMLElement): boolean {
  const box = slot.getBoundingClientRect();
  if (!box.width || !slot.parentElement) return false;
  const hits = (r: DOMRect) => r.width > 0 && r.height > 0 && r.right > box.left - CLEARANCE && r.left < box.right + CLEARANCE && r.bottom > box.top - 2 && r.top < box.bottom + 2;
  const range = document.createRange();
  for (const sibling of Array.from(slot.parentElement.children)) {
    if (sibling === slot) continue;
    const walker = document.createTreeWalker(sibling, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node: Node | null = sibling; node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(hits)) return false;
      } else if (!(node as Element).firstChild && hits((node as Element).getBoundingClientRect())) return false;
    }
  }
  return true;
}

/**
 * For the header placement, which is laid over the free space beside the title: true once
 * that space is measured free. Measured before the first paint, again when the header or
 * its contents change size and when the web fonts arrive (they change the title's width).
 * The slot is hidden, never removed, while this is false, so the answer moves nothing.
 */
function useClearSpace(ref: React.RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [clear, setClear] = useState(false);
  useLayoutEffect(() => {
    const slot = ref.current;
    const header = slot?.parentElement;
    if (!enabled || !slot || !header) return;
    let live = true;
    const measure = () => { if (live) setClear(clearOfSiblings(slot)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    for (const child of Array.from(header.children)) if (child !== slot) observer.observe(child);
    // A title that changes within its line (a client-side move to another record) resizes
    // no box, so the header's text and children are watched too.
    const changes = new MutationObserver(measure);
    changes.observe(header, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(measure);
    return () => { live = false; observer.disconnect(); changes.disconnect(); };
  }, [ref, enabled]);
  return clear;
}

/**
 * One sponsored image and link, in the page's flow (beside a title: over its free space). Renders nothing without a usable
 * campaign for the placement (lib/sponsors/campaigns.ts).
 *
 * The box is sized from the campaign's own width and height before the image loads, and
 * keeps that size if the image never does (a content blocker): it then holds a line of
 * text instead, so nothing around it moves.
 */
export default function SponsoredSlot({ placement, className = '' }: { placement: SponsorPlacement | 'mobile-menu'; className?: string }) {
  const inMobileMenu = placement === 'mobile-menu';
  // Beside a title (and in the phone menu) the campaigns take turns; elsewhere the first shows.
  const all = useSponsorCampaigns(inMobileMenu ? 'header' : placement);
  const turning = placement === 'header' || inMobileMenu;
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const overlaid = placement === 'header';
  const first = all[0] ?? null;
  const clear = useClearSpace(ref, overlaid && first !== null);
  const shown = useTurn(ref, turning ? all : all.slice(0, 1));
  const campaign = shown ?? first;
  if (!campaign || !first) return null;
  // The box keeps the first campaign's shape through every turn, so a turn moves nothing.
  const ratio = first.width / first.height;
  const own = sitePath(campaign.url);
  const box = {
    aspectRatio: ratio,
    maxWidth: overlaid ? undefined : first.width,
    ...(inMobileMenu && { '--sponsored-menu-ratio': ratio }),
  } as CSSProperties;
  const art = failed === campaign.id
    ? <span className="sponsored-slot-fallback">{S.fallback(campaign.sponsor)}</span>
    : <ContentImg src={campaign.image} alt={campaign.alt} width={campaign.width} height={campaign.height} referrerPolicy="no-referrer" onError={() => setFailed(campaign.id)} />;
  // Arkpedia's own banner is not an advertisement: no "Ad" tag, and it opens in this tab.
  const tag = own ? null : <span className="sponsored-slot-tag">{S.tag}</span>;
  return (
    <aside ref={ref} className={`sponsored-slot sponsored-slot--${placement} ${className}`.trim()} data-clear={overlaid && clear ? '' : undefined} aria-label={own ? S.ownRegion : S.region(campaign.sponsor)} data-sponsor-campaign={campaign.id}>
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
