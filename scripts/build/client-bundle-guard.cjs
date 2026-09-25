const path = require('path');

/*
 * Game records that must never be compiled into browser code. A record in a client chunk is
 * frozen at the deploy that built it: a content release changes the data every page is
 * rendered from and leaves the copy the browser runs unchanged, so the two disagree until
 * the next redeploy. data/albums.json shipped that way as the music player's queue (a 421 kB
 * chunk) while the pages around it read the release. Records the browser needs are
 * published in the release and fetched through contentUrl instead (lib/music/
 * musicCatalogue.ts). Server code -- getStaticProps, API routes -- may still import them.
 *
 * Paths relative to the repository root. Add one here when a record moves to the release.
 */
const CLIENT_FORBIDDEN = ['data/albums.json'];

/** The forbidden files among the modules a compilation holds, relative to `root`. */
function forbiddenClientModules(resources, root, forbidden = CLIENT_FORBIDDEN) {
  const wanted = new Set(forbidden.map(file => path.resolve(root, file)));
  const found = resources.filter(resource => typeof resource === 'string')
    .map(resource => path.resolve(resource.split('?')[0]))
    .filter(resource => wanted.has(resource));
  return [...new Set(found)].map(resource => path.relative(root, resource).split(path.sep).join('/')).sort();
}

/**
 * A webpack plugin for the browser compilation (next.config.js): fails the build, and puts
 * the dev overlay up, when a forbidden record is one of its modules, naming the chain of
 * imports that pulled it in. Next strips getStaticProps and the imports only it uses before
 * webpack sees a page, so what reaches this compilation is exactly what ships.
 */
class ClientDataGuard {
  constructor(root, forbidden = CLIENT_FORBIDDEN) {
    this.root = root;
    this.forbidden = forbidden;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('ClientDataGuard', (compilation) => {
      compilation.hooks.finishModules.tap('ClientDataGuard', (modules) => {
        const list = [...modules];
        const found = forbiddenClientModules(list.map(module => module.resource), this.root, this.forbidden);
        for (const file of found) {
          const module = list.find(candidate => typeof candidate.resource === 'string' && path.resolve(candidate.resource.split('?')[0]) === path.resolve(this.root, file));
          const chain = [];
          for (let at = module && compilation.moduleGraph.getIssuer(module); at && chain.length < 12; at = compilation.moduleGraph.getIssuer(at)) {
            if (typeof at.resource === 'string') chain.push(path.relative(this.root, at.resource.split('?')[0]));
          }
          const WebpackError = compiler.webpack?.WebpackError ?? Error;
          compilation.errors.push(new WebpackError(`${file} is compiled into browser code${chain.length ? ` (imported by ${chain.join(' <- ')})` : ''}. `
            + 'Game records the browser needs come from the content release through contentUrl, so a release reaches readers without a redeploy; '
            + 'see scripts/build/client-bundle-guard.cjs.'));
        }
      });
    });
  }
}

module.exports = { CLIENT_FORBIDDEN, ClientDataGuard, forbiddenClientModules };
