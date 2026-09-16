import Image from '@/components/content/ContentImage';
import { PriceEntry, getCurrencyIconPath, getCurrencyAbbreviation } from '@/lib/skins/skinPrice';

/** Renders a list of PriceEntry as "amount icon" for currencies with an
 * icon (currently just Originite Prime), or "amount ABBR" text for
 * ones without (DC, UC). Multiple entries are separated with " / ",
 * same as formatPrices' plain-text output. */
export default function PriceDisplay({ prices }: { prices: PriceEntry[] }) {
  if (prices.length === 0) return null;
  return (
    <span className="price-display">
      {prices.map((p, i) => {
        const iconPath = getCurrencyIconPath(p.currency);
        return (
          <span key={i} className="price-display-entry">
            {iconPath ? (
              <>
                {p.amount}
                <Image src={iconPath} alt={p.currency} width={14} height={14} className="price-display-icon" />
              </>
            ) : (
              `${p.amount} ${getCurrencyAbbreviation(p.currency)}`
            )}
            {i < prices.length - 1 && <span className="price-display-sep"> / </span>}
          </span>
        );
      })}
    </span>
  );
}