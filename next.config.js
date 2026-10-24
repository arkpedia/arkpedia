const assetRevisions = require('./data/assets/revisions.json');
const assetCdn = require('./config/asset-delivery.json');
const assetUrl = (repository, path) => assetCdn.template.replace('{repository}', repository).replace('{revision}', assetRevisions[repository]).replace('{path}', path);
const contentPageRoutes = require('./scripts/content/pages.json');
const { ClientDataGuard } = require('./scripts/build/client-bundle-guard.cjs');
const { contentPointer } = require('./scripts/content/content-channel.cjs');
const workerBuild = process.env.ARKPEDIA_WORKER === '1';
const stagingBuild = require('./scripts/deploy/deployment-role.cjs').deploymentRole() === 'staging';
for (const [repository, revision] of Object.entries(assetRevisions)) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`Invalid asset revision: ${repository}`);
}

// Which repository serves each top-level art folder: the same list lib/content/urls.ts reads.
const assetFolders = require('./config/asset-folders.json');
const SKIN_ASSET_FOLDERS = assetFolders['arkpedia-skin-assets'];
const IMAGE_ASSET_FOLDERS = assetFolders['arkpedia-image-assets'];

function externalAssetRedirects(folders, repository) {
  return folders.map((folder) => ({
    source: `/${folder}/:path*`,
    destination: assetUrl(repository, `${folder}/:path*`),
    permanent: false,
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(workerBuild ? { output: 'standalone' } : {}),
  // Only Check sets this after prebuild, typecheck and the warning-capped lint passed.
  // Avoid repeating those checks in both of its Next builds. Normal/local/Deploy
  // builds retain Next's validation, including manually dispatched deployments.
  ...(process.env.CI === 'true' && process.env.ARKPEDIA_BUILD_CHECKS_PASSED === '1' ? {
    typescript: { ignoreBuildErrors: true },
  } : {}),
  // Check builds a second time against the live content release, into a directory of its
  // own so the first build's output stays for the browser suites (check.yml, "Pages render
  // the live content release"). Unset everywhere else.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Count only live production traffic; dev is itself a Vercel production deployment,
  // so check its content channel too. Other builds never load a missing insights script.
  // ARKPEDIA_CONTENT_CHANNEL: the content pointer this build reads (lib/content/server.ts): the
  // channel of the project Deploy builds for (scripts/content/content-channel.cjs). Inlined
  // because the prebuilt functions carry no Vercel project env.
  env: { ARKPEDIA_WEB_ANALYTICS: !stagingBuild && process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production' && contentPointer() === 'live' ? '1' : '', ARKPEDIA_CONTENT_CHANNEL: contentPointer(), ARKPEDIA_WORKER: workerBuild ? '1' : '' },
  // The browser bundle may not carry a game record the content release publishes (such as
  // data/albums.json): the build fails, naming the import chain. See the guard's header.
  webpack(config, { isServer, webpack }) {
    if (!isServer) config.plugins.push(new ClientDataGuard(__dirname));
    // Account-import transport is browser-only; its WASM must not enter the Worker.
    if (isServer) config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^libcurl\.js(\/|$)/ }));
    return config;
  },
  experimental: {
    // Prerendering runs this many workers, each holding the page data. Left to Next it is the
    // host's cores less one, not the container's: 7 on the 8-core NAS, whose runners are capped
    // at 6 GB. On 2026-10-22 Next 16's Deploy build (which also type-checks) was killed there
    // twice at 7 workers (exit 137).
    cpus: 4,
  },
  // Top-level since Next 15: under `experimental` Next 16 ignores it with a warning, which it did
  // from #658 until 2026-10-22.
  // These routes use local records only while Next prerenders the bundled
  // fallback. In production their ISR functions read the signed release from
  // arkpedia-data, while public/ is emitted separately as static output.
  // Without this exclusion @vercel/nft follows the broad data readers and
  // copies every stage, operator, and generated public file into each function.
  outputFileTracingExcludes: {
    ...Object.fromEntries(contentPageRoutes.map((route) => [route === '/' ? '/index' : route, [
      'data/**/*', 'public/**/*', '.env*',
    ]])),
    // These endpoints are hard-blocked outside `next dev`; local tool inputs
    // and cached results must never be packaged into a deployed function.
    '/api/dev/**': ['data/**/*', 'public/**/*', '.cache/**/*', '.env*'],
    // Artwork voices read the published operator page; local catalogue readers are dev-only.
    '/api/artwork-voices': ['data/**/*', 'public/**/*', '.env*'],
  },
  async redirects() {
    // /enemies used to be a redirect to the first enemy's own page, because the
    // handbook had no index route -- it was 1,585 pre-rendered pages that were
    // 99.7% the same document. It is one page with the selection in the URL now,
    // so /enemies is a real destination and this maps the old per-enemy paths
    // onto it instead. One rule covers every old link, bookmark and search
    // result; the :slug is captured and handed straight to the query the page
    // reads.
    return [
      ...externalAssetRedirects(SKIN_ASSET_FOLDERS, 'arkpedia-skin-assets'),
      ...externalAssetRedirects(IMAGE_ASSET_FOLDERS, 'arkpedia-image-assets'),
      {
        source: '/skin-originals/:path*',
        destination: assetUrl('arkpedia-skin-assets', 'originals/:path*'),
        permanent: false,
      },
      {
        source: '/skin-variants/:format/:width/:path*',
        destination: assetUrl('arkpedia-skin-assets', 'variants/:format/:width/:path*'),
        permanent: false,
      },
      { source: '/community/livestreams', destination: '/community/videos', permanent: true },
      // arkpedia.net/?s=<query> is the site search too (pages/search.tsx), for anyone who
      // sets the site up as a search engine by hand. Only on the home page: /stages/browse
      // already reads ?s= as its selected stage. The query string is carried across.
      {
        source: '/',
        has: [{ type: 'query', key: 's' }],
        destination: '/search',
        permanent: false,
      },
      ...['characters', 'artists', 'origins'].map((collection) => ({
        source: `/music/discover/${collection}`,
        destination: `/music/discover?browse=${collection}`,
        permanent: true,
      })),
      // The Schedule page lived at /timeline until the Events list became one of its
      // two views and the page stopped being only a calendar. Its own nav entry had
      // said "Schedule" for a while by then, so the address was the last thing still
      // calling it a timeline. Kept as a redirect rather than dropped: it is a real
      // URL people have bookmarked, and /events redirects here too, so removing it
      // would break that hop as well.
      { source: '/timeline', destination: '/schedule', permanent: true },
      { source: '/guesser', destination: '/games/operator-guesser', permanent: true },
      { source: '/enemies/:slug', destination: '/enemies?e=:slug', permanent: true },
      { source: '/music/guesser', destination: '/games/music-guesser', permanent: true },
      {
        // Same story for the Terminal's stage view: 3,786 pre-rendered pages
        // that were one page with a selection. The negative lookahead is load
        // bearing -- redirects run BEFORE filesystem routes, so a bare
        // /stages/:slug would swallow the Terminal's own sections (all,
        // regular, seasonal...) and /stages/browse itself, which is where this
        // points. Those are real pages and must not be captured.
        source: '/stages/:slug((?!browse$|all$|regular$|seasonal$|exploration$|score$|supplies$|content$|content/).+)',
        destination: '/stages/browse?s=:slug',
        permanent: true,
      },
      { source: '/guesser/palette', destination: '/games/color-palette', permanent: true },
      { source: '/guesser/recruitment', destination: '/games/recruitment-guesser', permanent: true },
    ];
  },
  images: {
    // Media is served directly from the public Arkpedia asset repositories.
    // Keeping Next's optimizer out of the request path prevents those bytes
    // from being proxied through and billed to the Vercel deployment.
    unoptimized: true,
    // Vercel bills per unique (source, width, quality, format). Next's default
    // ladder runs to 3840px in sixteen steps, and it only trims that list when a
    // `sizes` string contains a vw unit -- most of ours are plain pixel values,
    // so they were asking for every rung. Nothing on this site is laid out wider
    // than about 1600px, so the top two rungs could only ever produce a
    // transformation no reader would see: the widest real case is a skin at full
    // bleed in the zoom overlay.
    deviceSizes: [640, 750, 828, 1080, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Static assets (operator icons, skins, banner art) never change once
    // published -- the 60-second default meant the browser cache for
    // these was constantly expiring and re-hitting Vercel's edge for the
    // exact same unchanged image during any session longer than a
    // minute (e.g. repeated gacha pulls). 1 year matches how these
    // assets are actually versioned (a new upload gets a new filename,
    // not an in-place overwrite).
    minimumCacheTTL: 31536000,
    remotePatterns: [
      { protocol: 'https', hostname: 'raw.githubusercontent.com', pathname: '/arkpedia/**' },
      {
        protocol: 'https',
        hostname: '*.ytimg.com', // YouTube video thumbnails -- covers i.ytimg.com plus the numbered CDN subdomains (i1/i2/i3/i4.ytimg.com) YouTube load-balances across
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // explicit non-wildcard entry too, since the bare (non-numbered) subdomain doesn't always match a wildcard pattern consistently across image loaders
      },
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net', // Twitch stream preview thumbnails (live-content)
      },
    ],
  },
  async headers() {
    // Every asset folder is a redirect to one commit of an asset repository, the
    // commit pinned by the LAST DEPLOY -- see externalAssetRedirects. Read from the
    // redirects themselves, so a folder added there is covered here too.
    const assetRedirects = (await nextConfig.redirects()).filter(({ destination }) => /^https:\/\//.test(destination));
    return [
      {
        /* Security headers on every response.
           The site had none, which is the default and not a deliberate choice.
           None of these change how the site behaves; each closes a class of attack
           that does not need a bug here to work.

           X-Frame-Options: nobody can put the site in an iframe on their own page and
           trick a reader into clicking something else. The one thing to know is that
           it would also block a legitimate embed, and nothing here is meant to be
           embedded.

           X-Content-Type-Options: the browser must believe the Content-Type rather than
           sniffing the bytes, so an uploaded file cannot be talked into running as a
           script.

           Referrer-Policy: an outbound link to the wiki or YouTube carries the origin
           but not the path, so the exact page a reader was on is not handed to them.

           Permissions-Policy: the site never asks for a camera, a microphone or a
           location, so it says so, and an injected script cannot ask on its behalf.

           No Content-Security-Policy yet, deliberately. It is the strongest of these
           and the only one that can break a page: the Google Fonts stylesheet, the
           inline theme script in _document, next/image and YouTube embeds all need
           naming, and getting it wrong shows up as a blank page rather than a warning.
           Worth doing as its own change, with each page checked. */
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // A main-code preview reads live-compatible data but must remain unindexed.
          ...(stagingBuild || contentPointer() !== 'live' ? [{ key: 'X-Robots-Tag', value: 'noindex' }] : []),
        ],
      },
      {
        // The big client-fetched data indexes. These are NOT images, so the rule
        // below never matched them and Vercel served them as
        // `max-age=0, must-revalidate` -- meaning stages-index.json (1.2MB) was
        // revalidated on entry to any of ~3,800 stage pages and enemies-index.json
        // (616KB) on all ~1,600 enemy pages. StageList.tsx's own comment claims
        // "one fetch for the whole visit"; this is what makes that true.
        //
        // Deliberately NOT immutable: unlike the images, these are overwritten in
        // place under the same URL by the daily data refresh, so they get a short
        // fresh window plus a long stale-while-revalidate instead -- the reader
        // gets an instant cached copy and the new one lands in the background.
        source: '/:path*.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // Matches every static image file under /public, regardless of
        // which subfolder it lives in (operator icons, skin images,
        // banner images, class/branch/material icons, stage maps, etc.)
        // -- this is deliberately broad by file extension rather than
        // enumerating specific folders, so it automatically covers new
        // image folders added later without needing this file updated.
        source: '/:path*.:ext(png|webp|jpg|jpeg|svg|gif|avif)',
        headers: [
          {
            // immutable + a long max-age is safe here because these are
            // scraped/generated assets that get a new filename whenever
            // the underlying image actually changes, rather than being
            // overwritten in place under the same URL.
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // ...except where the "file" is one of the asset redirects, which is every image
      // path today: public/ holds no images. Vercel sends header rules on a redirect
      // too (next dev and next start do not), so the rule above went out on the 307 by
      // its extension, and a browser kept the redirect -- and with it the asset commit
      // of whichever deploy it first saw -- for a year, and art published since never
      // reached it. What the redirect points at is commit-pinned and never changes;
      // the redirect itself changes with every deploy, so it may only be kept briefly.
      // Header rules are applied in order and a later match replaces an earlier one's
      // value, which is why these come after the broad rule rather than inside it.
      ...assetRedirects.map(({ source }) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }],
      })),
      // Which code this deployment runs (scripts/build/write-build-info.mjs). The content
      // release job reads it before it publishes and holds a release compiled by other code;
      // a copy kept by any cache would let a release through that the running build cannot
      // read, or hold one it can. After the broad .json rule, so it replaces that value.
      { source: '/build-info.json', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

module.exports = (phase) => {
  if (phase === 'phase-production-build' || phase === 'phase-development-server') {
    require('./scripts/build/build-public-asset-index.cjs').buildPublicAssetIndex(__dirname);
  }
  return nextConfig;
};
