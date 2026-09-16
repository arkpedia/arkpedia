const fs = require('fs');
const path = require('path');
const assetRevisions = require('./data/assets/revisions.json');
for (const [repository, revision] of Object.entries(assetRevisions)) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`Invalid asset revision: ${repository}`);
}

/**
 * /enemies is the handbook, and the handbook is the frame on /enemies/<slug>: a
 * grid of every enemy beside whichever one is open. So the section has no separate
 * browse page -- it opens the first enemy, the way the game's handbook opens on B1.
 *
 * The redirect lives here rather than in a page because `redirect` cannot be
 * returned from getStaticProps during prerendering: it works in dev and then fails
 * the production build. The destination is read out of the index rather than
 * hardcoded, so it follows the data if handbook order ever changes.
 */
function firstEnemySlug() {
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/enemies-index.json'), 'utf8'));
    const first = rows
      .filter((e) => !e.hidden)
      .sort((a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug))[0];
    return first ? first.slug : null;
  } catch {
    return null;
  }
}

const ENEMY_HANDBOOK_ENTRY = firstEnemySlug();

const SKIN_ASSET_FOLDERS = [
  'one-star-skins', 'two-star-skins', 'three-star-skins', 'four-star-skins',
  'five-star-skins', 'six-star-skins', 'skin-series-logos',
];
const IMAGE_ASSET_FOLDERS = [
  'act-marks', 'album-covers', 'alliance-icons', 'base-skill-icons', 'branch-icons',
  'cg-collection', 'class-icons', 'content-art', 'cursors', 'enemies-icons',
  'enemy-stat-icons', 'essential-icons', 'event-poster', 'faction-icons',
  'five-star-icons', 'four-star-icons', 'headhunting-banner-images', 'item-icons',
  'material-icons', 'mode-marks', 'nation-marks', 'one-star-icons', 'ra-map',
  'six-star-icons', 'skill-icons', 'stages-images', 'stat-icons', 'story-marks',
  'stronghold-items', 'stronghold-stratagems', 'stronghold-types',
  'three-star-icons', 'two-star-icons',
];

function externalAssetRedirects(folders, repository) {
  return folders.map((folder) => ({
    source: `/${folder}/:path*`,
    destination: `https://raw.githubusercontent.com/arkpedia/${repository}/${assetRevisions[repository]}/${folder}/:path*`,
    permanent: false,
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The redirect above serves anyone who ARRIVES at /enemies -- a typed URL, a
  // bookmark, a search result. It cannot serve next/link: the client router looks
  // for a /enemies page chunk, 404s on it, and falls back to window.location, so
  // every in-app link to the section reloaded the whole app. In-app links point at
  // the real page instead, and read the slug from here so the two cannot drift.
  // See lib/enemies/handbookEntry.ts.
  env: { NEXT_PUBLIC_ENEMY_HANDBOOK_ENTRY: ENEMY_HANDBOOK_ENTRY || '' },
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
        destination: `https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/${assetRevisions['arkpedia-skin-assets']}/originals/:path*`,
        permanent: false,
      },
      {
        source: '/skin-variants/:format/:width/:path*',
        destination: `https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/${assetRevisions['arkpedia-skin-assets']}/variants/:format/:width/:path*`,
        permanent: false,
      },
      { source: '/community/livestreams', destination: '/community/videos', permanent: true },
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
      {
        protocol: 'https',
        hostname: 'arknights.wiki.gg', // Main Theme / Supply group cover images -- temporary until these get downloaded and converted to local webp like stage maps already are
      },
    ],
  },
  async headers() {
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
    ];
  },
};

module.exports = (phase) => {
  if (phase === 'phase-production-build' || phase === 'phase-development-server') {
    require('./scripts/build/build-public-asset-index.cjs').buildPublicAssetIndex(__dirname);
  }
  return nextConfig;
};
