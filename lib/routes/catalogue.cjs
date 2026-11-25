/* global ARKPEDIA_COMPILED_PAGE_CATALOGUE */
// Next and the content exporter embed the same policy data at compile time. Direct
// Node tools and tests read it from the source tree without a generation step.
const pageCatalogue = typeof ARKPEDIA_COMPILED_PAGE_CATALOGUE === 'undefined'
  ? require('../../scripts/content/page-catalogue.cjs').loadPageCatalogue()
  : ARKPEDIA_COMPILED_PAGE_CATALOGUE;

const releaseRoutes = pageCatalogue.flatMap(page => page.key ? [page.key] : []);

module.exports = { pageCatalogue, releaseRoutes };
