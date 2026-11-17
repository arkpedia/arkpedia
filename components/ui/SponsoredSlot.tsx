import { useContext, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { ContentTablesContext } from '@/lib/content/context';
import { useReaderValue } from '@/lib/time/readerClock';
import { sponsorCampaignFor, type SponsorCampaign, type SponsorCampaignTable, type SponsorPlacement } from '@/lib/sponsors/campaigns';
import { SPONSOR_STRINGS as S } from '@/lib/sponsors/strings';

/* Draft campaigns show in `next dev` and in a build made with NEXT_PUBLIC_SPONSOR_PREVIEW=1
   (a review deployment), never on the public site. */
const DRAFTS = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SPONSOR_PREVIEW === '1';

/**
 * The campaign a placement shows now, or null.
 *
 * The first render takes the table as the server sent it: withContentPage has already
 * dropped the campaigns outside their dates at the request (lib/content/server.ts), so
 * the markup matches. After mount the reader's clock decides, which only differs for a
 * page cached across a campaign's first or last minutes. A page that is not a content
 * route (no withContentPage) carries no table and shows nothing.
 */
export function useSponsorCampaign(placement: SponsorPlacement): SponsorCampaign | null {
  const table = useContext(ContentTablesContext)['sponsor-campaigns'] as SponsorCampaignTable | undefined;
  return useReaderValue(
    table ? sponsorCampaignFor(table, placement, null, DRAFTS) : null,
    readerMs => table ? sponsorCampaignFor(table, placement, readerMs, DRAFTS) : null,
    { onFocus: true },
  );
}

/**
 * One sponsored image and link, in the page's flow. Renders nothing without a usable
 * campaign for the placement (lib/sponsors/campaigns.ts).
 *
 * The box is sized from the campaign's own width and height before the image loads, and
 * keeps that size if the image never does (a content blocker): it then holds a line of
 * text instead, so nothing around it moves.
 */
export default function SponsoredSlot({ placement, className = '' }: { placement: SponsorPlacement; className?: string }) {
  const campaign = useSponsorCampaign(placement);
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
