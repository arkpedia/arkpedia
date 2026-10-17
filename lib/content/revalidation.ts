import { CLOCK_ROUTES } from './pageClock';

/** Browsers update their clocks on mount/ticks. Avoid rewriting large identical records
 * every minute just because the SSR clock changed. Content publication refreshes these
 * routes explicitly; detail pages retain their one-minute discovery interval. */
export function defaultContentRevalidate(route: string): number {
  return CLOCK_ROUTES.includes(route) ? 300 : 60;
}
