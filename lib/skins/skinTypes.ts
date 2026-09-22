export interface Skin {
  name: string;
  searchAliases?: string[];
  series: string;
  seriesImage: string | null;
  code: string | null;
  model: string | null;
  illustrator: string | null;
  description: string | null;
  release: string | null;
  howToObtain: string | null;
  image: string | null;
  // The date this skin was first added to Fashion Review, if it's ever
  // been part of it -- "YYYY/MM/DD", set once at the event it debuted
  // in and carried forward through every later Celebration/Carnival/
  // Festival event's Outfit Store from then on.
  fashionReviewDate?: string;
  // Everything below is derived at build time (see computeSkinAvailability
  // in lib/skinAvailability.ts) -- not present in the raw scraped data.
  availableDate?: string; // ISO "YYYY-MM-DD", when this skin first becomes/became available
  availableEventName?: string; // the event whose date matched availableDate
  isFashionReviewAvailability?: boolean; // true if availableDate came from fashionReviewDate rather than a direct release match
  daysUntilAvailable?: number | null; // null if already available or unknown; positive integer if still upcoming
  availableUntil?: string; // ISO "YYYY-MM-DD", when the window closes
  availableNow?: boolean; // the window is open today rather than being counted down to
}