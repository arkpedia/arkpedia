import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { operatorHref } from '@/lib/operators/operatorHref';
import ImportDialog from '@/components/account/ImportDialog';
import InfoPopover from '@/components/ui/InfoPopover';
import PriceDisplay from '@/components/ui/PriceDisplay';
import CommunityStats from '@/components/community/CommunityStats';
import { parsePrices } from '@/lib/skins/skinPrice';
import { acquisitionLabel, type SkinCountdown } from '@/lib/skins/skinAvailability';
import type { Skin } from '@/lib/skins/skinTypes';
import { SERVER_TIME, serverOffsetLabel } from '@/lib/time/servers.mjs';
import ResponsiveSkinArtwork from './ResponsiveSkinArtwork';
import SkinZoomOverlay from './SkinZoomOverlay';

interface Props {
  skin: Skin;
  onClose: () => void;
  availability?: SkinCountdown;
  wishlist?: { wished: boolean; owned: boolean; toggle: () => void };
  dynamic?: string | null;
  alternate?: string | null;
  footer?: ReactNode;
}

const exactDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: SERVER_TIME.en.timeZone }) + ` (${serverOffsetLabel('en')})`;

/** One outfit record across the gallery, homepage and schedule. Artwork stays uncropped;
 * the native dialog keeps actions available while its single body scrolls. */
export default function SkinDetailDialog({ skin, onClose, availability, wishlist, dynamic = skin.dynamic ?? null, alternate = skin.alternate ?? null, footer }: Props) {
  const [zooming, setZooming] = useState(false);
  const prices = parsePrices(skin.howToObtain);
  const release = availability?.live ? skin.release?.replace(/\[CN\]\s*/g, '') : skin.release;
  const originalShop = !!availability && availability.kind !== 'shop';
  return <ImportDialog title={skin.name} className="skin-modal" onClose={onClose} dismissible={!zooming}
    actions={wishlist && <button type="button" className="filter-chip skin-detail-wishlist" aria-pressed={wishlist.wished} disabled={wishlist.owned} onClick={wishlist.toggle}>
      <span aria-hidden="true">{wishlist.owned ? '✓' : wishlist.wished ? '★' : '☆'}</span>{' '}<span>{wishlist.owned ? 'Owned' : wishlist.wished ? 'Wishlisted' : 'Wishlist'}</span>
    </button>}>
    <div className="skin-detail-layout" inert={zooming}>
      <figure className="skin-detail-art">
        {skin.image ? <button type="button" className="btn-bare skin-detail-art-button" aria-label={`View full artwork of ${skin.name}`} onClick={() => setZooming(true)}>
          <ResponsiveSkinArtwork src={skin.image} alt={skin.name} width={1600} height={900} sizes="(min-width: 800px) 560px, 90vw" />
          <span className="skin-detail-expand" aria-hidden="true">View full artwork ↗</span>
        </button> : <p className="hint">Artwork unavailable.</p>}
        {skin.illustrator && <figcaption>Illustration by {skin.illustrator}</figcaption>}
      </figure>
      <div className="skin-detail-info reading-copy">
        <div className="skin-detail-identity">
          {skin.model && <Link prefetch={false} href={operatorHref(skin.model, null)}>{skin.model}</Link>}
          {skin.series && <span>{skin.series}</span>}
        </div>
        <section className="skin-detail-acquisition" aria-label="Outfit availability">
          <div className="skin-detail-acquisition-heading">
            <div>
              <h3 className="entity-title entity-title-sm">{availability ? availability.live ? 'Available now' : availability.estimated ? 'Estimated availability' : 'Upcoming' : 'Original acquisition'}</h3>
              <p>{availability ? acquisitionLabel(availability) : skin.howToObtain?.replace(/\s*\([^)]*(?:Originite Prime|\bOP\b|Certificate|\bDC\b|\bUC\b)[^)]*\)/gi, '').trim() || 'Not recorded'}</p>
            </div>
            {prices.length > 0 && <div className="skin-detail-price"><PriceDisplay prices={prices} /><small>{originalShop ? 'Original shop price' : 'Catalogue price'}</small></div>}
            {availability && <InfoPopover label="Availability details">
              <p>{availability.label} · {availability.event.replace(/\[[^\]]*\]\s*/g, '')}</p>
              <p>{exactDate(availability.startAt)} – {exactDate(availability.endAt)}</p>
              {availability.details && <p>{availability.details}</p>}
              {availability.source && <p><a href={availability.source} target="_blank" rel="noreferrer">{availability.estimated ? 'Schedule source' : 'Official announcement'} ↗</a></p>}
              {availability.inventorySource && <p><a href={availability.inventorySource} target="_blank" rel="noreferrer">Pool contents ↗</a></p>}
              {originalShop && skin.howToObtain && <p>Original acquisition: {skin.howToObtain}</p>}
            </InfoPopover>}
          </div>
          {availability && <p className="skin-detail-date">{availability.live ? 'Until ' : availability.estimated ? 'Expected ' : 'From '}{exactDate(availability.live ? availability.endAt : availability.startAt)}</p>}
        </section>
        {skin.description && <p>{skin.description}</p>}
        {(release || skin.code) && <details className="skin-detail-release"><summary>Release details</summary>
          {release && <p>Original release: {release}</p>}
          {skin.code && <p>Collection reference: {skin.code}</p>}
          {skin.howToObtain && <p>Original acquisition: {skin.howToObtain}</p>}
        </details>}
        {skin.skinId && <div className="skin-detail-community"><CommunityStats skin={skin.skinId} compact /></div>}
        {footer && <div className="skin-detail-footer">{footer}</div>}
      </div>
    </div>
    {zooming && skin.image && <SkinZoomOverlay voiceOperator={skin.model ?? undefined} image={skin.image} name={skin.name} dynamic={dynamic} alternate={alternate} onClose={() => setZooming(false)} />}
  </ImportDialog>;
}
