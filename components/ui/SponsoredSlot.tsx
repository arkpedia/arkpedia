import { useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { useReleaseTable } from '@/lib/content/context';
import { useReaderValue } from '@/lib/time/readerClock';
import { sponsorCampaignFor, type SponsorCampaign, type SponsorCampaignTable, type SponsorPlacement } from '@/lib/sponsors/campaigns';
import { SPONSOR_STRINGS as S } from '@/lib/sponsors/strings';

/* Draft campaigns show in `next dev` and in a build made with NEXT_PUBLIC_SPONSOR_PREVIEW=1
   (a review deployment), never on the public site. */
const DRAFTS = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SPONSOR_PREVIEW === '1';

/** The campaign a placement shows now, or null: the server's answer first, then the reader's clock. */
export function useSponsorCampaign(placement: SponsorPlacement, now?: number): SponsorCampaign | null {
  const table = useReleaseTable<SponsorCampaignTable>('sponsor-campaigns');
  return useReaderValue(
    sponsorCampaignFor(table, placement, now ?? null, DRAFTS),
    readerMs => sponsorCampaignFor(table, placement, readerMs, DRAFTS),
    { onFocus: true },
  );
}

/**
 * One sponsored image and link, in the page's flow. Renders nothing without a usable
 * campaign for the placement (lib/sponsors/campaigns.ts).
 *
 * The box is sized from the campaign's own width and height before the image loads, and
 * keeps that size if the image never does (a content blocker): it then holds a line of
 * text instead, so nothing below it moves.
 *
 * `now` is the page's request clock where the route has one (lib/content/pageClock.ts):
 * the server then renders the slot only inside the campaign's window. Without it the
 * first render shows any active campaign, and one outside its window is removed once the
 * page has mounted; put such a slot last on its page, where removing it moves nothing.
 */
export default function SponsoredSlot({ placement, now, className = '' }: { placement: SponsorPlacement; now?: number; className?: string }) {
  const campaign = useSponsorCampaign(placement, now);
  const [failed, setFailed] = useState<string | null>(null);
  if (!campaign) return null;
  const draft = campaign.status === 'draft';
  const box = { aspectRatio: `${campaign.width} / ${campaign.height}`, maxWidth: campaign.width };
  const art = failed === campaign.id
    ? <span className="sponsored-slot-fallback">{S.fallback(campaign.sponsor)}</span>
    : <ContentImg src={campaign.image} alt={campaign.alt} width={campaign.width} height={campaign.height} referrerPolicy="no-referrer" onError={() => setFailed(campaign.id)} />;
  return (
    <aside className={`sponsored-slot sponsored-slot--${placement} ${className}`.trim()} aria-label={S.region(campaign.sponsor)} data-sponsor-campaign={campaign.id}>
      <p className="sponsored-slot-label">{draft ? S.draftLabel : S.label}</p>
      {campaign.url ? (
        <a className="sponsored-slot-art" style={box} href={campaign.url} target="_blank" rel="sponsored noopener noreferrer" aria-label={S.linkLabel(campaign.sponsor, campaign.alt)}>
          {art}
        </a>
      ) : (
        <div className="sponsored-slot-art" style={box}>{art}</div>
      )}
    </aside>
  );
}
