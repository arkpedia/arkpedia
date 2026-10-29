const path = require('path');

/*
 * No game record may be compiled into browser code, except the few named here. A record in a
 * client chunk is frozen at the deploy that built it: a content release changes the data every
 * page is rendered from and leaves the copy the browser runs unchanged, so the two disagree
 * until the next redeploy. data/albums.json shipped that way as the music player's queue (a
 * 421 kB chunk) while the pages around it read the release, and eleven other tables were in
 * browser chunks as dead fallbacks when this list only named the ones someone had thought of.
 * Records the browser needs reach it in the page's props (lib/content/tables.mjs) or through
 * contentUrl from the release. Server code -- getStaticProps, API routes -- may still import
 * them.
 *
 * So it denies by default: every data/ JSON module is refused unless it is allowed below. The
 * same list drives the post-build chunk scan (scripts/audits/check-client-chunks.mjs) and the
 * source walk in npm test (scripts/tests/test-client-game-tables.ts).
 */

/** Allowed from anywhere, with why. Paths relative to the repository root. */
const CLIENT_ALLOWED = {
  // The deploy's asset pins: contentUrl's fallback for a page rendered without a release.
  'data/assets/revisions.json': 'asset pins for pages without a content release (lib/content/urls.ts)',
  // A closed survey's aggregate, never refreshed, and /results' whole content.
  'data/polls/power-scale-v1.0.json': 'the closed power-scale poll /results draws (lib/results/finalPollResults.ts)',
};

/**
 * Allowed only through the importers named, and only in the pages named (for the chunk scan).
 * SL-4b (REVIEW.md, 2026-09-25): withLocalConfirmedSkinWindows merges the bundled confirmed
 * sale windows into /skins' published ones, pending a maintainer decision to keep it as an
 * emergency override with an expiry or remove it. Nothing else may import that table.
 */
const CLIENT_ALLOWED_EDGES = {
  'data/skin-availability-windows.json': { importers: ['lib/skins/localSkinWindows.ts'], pages: ['/skins'], why: 'SL-4b, pending a maintainer decision' },
};

const relative = (root, resource) => path.relative(root, path.resolve(resource.split('?')[0])).split(path.sep).join('/');
const isData = file => /^data\/.+\.json$/.test(file);

/**
 * The data/ JSON files among a compilation's modules that browser code may not hold, relative
 * to `root`. `importersOf(file)` names the modules (relative paths) that import one; a file in
 * CLIENT_ALLOWED_EDGES passes only when every importer is one it allows.
 */
function deniedClientModules(resources, root, importersOf) {
  const files = [...new Set(resources.filter(resource => typeof resource === 'string').map(resource => relative(root, resource)))];
  return files.filter(file => {
    if (!isData(file) || Object.hasOwn(CLIENT_ALLOWED, file)) return false;
    const edge = CLIENT_ALLOWED_EDGES[file];
    if (!edge) return true;
    const importers = importersOf(file);
    return !importers.length || importers.some(importer => !edge.importers.includes(importer));
  }).sort();
}

/**
 * A webpack plugin for the browser compilation (next.config.js): fails the build, and puts
 * the dev overlay up, when a denied record is one of its modules, naming the chain of imports
 * that pulled it in. Next strips getStaticProps and the imports only it uses before webpack
 * sees a page, so what reaches this compilation is what the browser half imports.
 */
class ClientDataGuard {
  constructor(root) {
    this.root = root;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('ClientDataGuard', (compilation) => {
      compilation.hooks.finishModules.tap('ClientDataGuard', (modules) => {
        const list = [...modules];
        const moduleOf = file => list.find(candidate => typeof candidate.resource === 'string' && relative(this.root, candidate.resource) === file);
        const importersOf = (file) => {
          const module = moduleOf(file);
          const graph = compilation.moduleGraph;
          const origins = typeof graph.getIncomingConnections === 'function'
            ? [...graph.getIncomingConnections(module)].map(connection => connection.originModule)
            : [graph.getIssuer(module)];
          return [...new Set(origins.filter(origin => origin && typeof origin.resource === 'string').map(origin => relative(this.root, origin.resource)))];
        };
        for (const file of deniedClientModules(list.map(module => module.resource), this.root, importersOf)) {
          const module = moduleOf(file);
          const chain = [];
          for (let at = module && compilation.moduleGraph.getIssuer(module); at && chain.length < 12; at = compilation.moduleGraph.getIssuer(at)) {
            const from = typeof at.resource === 'string' ? relative(this.root, at.resource) : '';
            // Next's page entry resolves to the repository root itself: nothing to name.
            if (from) chain.push(from);
          }
          const WebpackError = compiler.webpack?.WebpackError ?? Error;
          compilation.errors.push(new WebpackError(`${file} is compiled into browser code${chain.length ? ` (imported by ${chain.join(' <- ')})` : ''}. `
            + 'Game records reach the browser in the page props (lib/content/tables.mjs) or through contentUrl, so a release reaches readers without a redeploy; '
            + 'see scripts/build/client-bundle-guard.cjs.'));
        }
      });
    });
  }
}

module.exports = { CLIENT_ALLOWED, CLIENT_ALLOWED_EDGES, ClientDataGuard, deniedClientModules };
