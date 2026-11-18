import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { ContentTablesContext } from '@/lib/content/context';
import { sponsorCampaignFor, type SponsorCampaign, type SponsorCampaignTable, type SponsorPlacement } from '@/lib/sponsors/campaigns';
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
export function useSponsorCampaign(placement: SponsorPlacement): SponsorCampaign | null {
  const table = useContext(ContentTablesContext)['sponsor-campaigns'] as SponsorCampaignTable | undefined;
  return table ? sponsorCampaignFor(table, placement, null, DRAFTS) : null;
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
export default function SponsoredSlot({ placement, className = '' }: { placement: SponsorPlacement; className?: string }) {
  const campaign = useSponsorCampaign(placement);
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const overlaid = placement === 'header';
  const clear = useClearSpace(ref, overlaid && campaign !== null);
  if (!campaign) return null;
  // Beside a title the stylesheet gives the height and the ratio gives the width.
  const box = overlaid ? { aspectRatio: `${campaign.width} / ${campaign.height}` } : { aspectRatio: `${campaign.width} / ${campaign.height}`, maxWidth: campaign.width };
  const art = failed === campaign.id
    ? <span className="sponsored-slot-fallback">{S.fallback(campaign.sponsor)}</span>
    : <ContentImg src={campaign.image} alt={campaign.alt} width={campaign.width} height={campaign.height} referrerPolicy="no-referrer" onError={() => setFailed(campaign.id)} />;
  const tag = <span className="sponsored-slot-tag">{S.tag}</span>;
  return (
    <aside ref={ref} className={`sponsored-slot sponsored-slot--${placement} ${className}`.trim()} data-clear={overlaid && clear ? '' : undefined} aria-label={S.region(campaign.sponsor)} data-sponsor-campaign={campaign.id}>
      {campaign.url ? (
        <a className="sponsored-slot-art" style={box} href={campaign.url} target="_blank" rel="sponsored noopener noreferrer" aria-label={S.linkLabel(campaign.sponsor, campaign.alt)}>
          {art}{tag}
        </a>
      ) : (
        <div className="sponsored-slot-art" style={box}>{art}{tag}</div>
      )}
    </aside>
  );
}
