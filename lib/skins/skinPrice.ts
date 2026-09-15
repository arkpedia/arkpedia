export interface PriceEntry {
  amount: number;
  currency: string;
}

// Matches both the full currency name ("150 Originite Prime") and its
// common abbreviation ("150 OP") -- skin howToObtain text scraped from
// the wiki isn't consistent about which form it uses. \b after the
// alternation keeps "OP" from matching as part of a longer word; it
// still requires a preceding number, so a false match (something else
// starting with "op" right after a digit) is unlikely in practice.
const PRICE_PATTERN = /(\d+)\s*(Distinction Certificate|DC|Universal Certificate|UC|Originite Prime|OP)\b/gi;

const CURRENCY_CANONICAL: Record<string, string> = {
  'distinction certificate': 'Distinction Certificate',
  dc: 'Distinction Certificate',
  'universal certificate': 'Universal Certificate',
  uc: 'Universal Certificate',
  'originite prime': 'Originite Prime',
  op: 'Originite Prime',
};

/** Extracts any certificate/Originite Prime prices mentioned in a skin's
 * "How to obtain" text, e.g. "Certificate Store (40 Distinction
 * Certificate or 400 Universal Certificate)" -> two PriceEntry results.
 * Abbreviated forms ("40 DC", "150 OP") are recognized the same way and
 * normalized to the full currency name either way, so callers never
 * need to handle both forms themselves. */
export function parsePrices(howToObtain: string | null): PriceEntry[] {
  if (!howToObtain) return [];
  const results: PriceEntry[] = [];
  let match: RegExpExecArray | null;
  PRICE_PATTERN.lastIndex = 0;
  while ((match = PRICE_PATTERN.exec(howToObtain)) !== null) {
    const canonical = CURRENCY_CANONICAL[match[2].toLowerCase()] || match[2];
    results.push({ amount: parseInt(match[1], 10), currency: canonical });
  }
  return results;
}

const CURRENCY_ABBR: Record<string, string> = {
  'Distinction Certificate': 'DC',
  'Universal Certificate': 'UC',
  'Originite Prime': 'OP',
};

/** Plain-text price display, e.g. "40 DC / 400 UC" -- for places that
 * just want a string, not an icon. Use PriceDisplay (components/
 * PriceDisplay.tsx) instead where an icon is wanted for currencies
 * that have one (currently just Originite Prime). */
export function formatPrices(prices: PriceEntry[]): string {
  return prices.map((p) => `${p.amount} ${CURRENCY_ABBR[p.currency] || p.currency}`).join(' / ');
}

// Icon path per currency -- only Originite Prime has a real icon file
// right now (public/material-icons/Originite Prime.webp). DC/UC return
// null, so callers fall back to plain "amount ABBR" text for those.
const CURRENCY_ICON: Record<string, string> = {
  'Originite Prime': '/material-icons/Originite Prime.webp',
};

export function getCurrencyIconPath(currency: string): string | null {
  return CURRENCY_ICON[currency] || null;
}

export function getCurrencyAbbreviation(currency: string): string {
  return CURRENCY_ABBR[currency] || currency;
}