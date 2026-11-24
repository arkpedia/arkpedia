import { pageCatalogue } from '../../lib/routes/catalogue.cjs';

/** Resolve public routes and stable content-release keys to their one source file. */
export function pageSource(route) {
  return pageCatalogue.find(page => page.route === route || page.key === route)?.file ?? null;
}
