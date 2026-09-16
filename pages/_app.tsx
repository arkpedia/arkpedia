import { ContentContext, ContentTablesContext } from '@/lib/content/context';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '@/styles/core/shared.css';
/* Straight after shared.css, which owns the tokens it reads, and before the 29
   feature stylesheets, so a page not yet migrated can still override a primitive
   with its own bespoke rule. */
import '@/styles/core/arkpedia-theme.css';
import '@/styles/core/nav.css';
import '@/styles/ui/ticker.css';
import '@/styles/base/base.css';
import '@/styles/schedule/events.css';
import '@/styles/gacha/gacha.css';
import '@/styles/gacha/gacha-tutorial.css';
import '@/styles/games/guesser.css';
import '@/styles/skins/skins.css';
import '@/styles/operators/roster.css';
import '@/styles/operators/operator-detail.css';
import '@/styles/planner/planner.css';
import '@/styles/planner/planner-depot.css';
import '@/styles/schedule/timeline.css';
import '@/styles/recruitment/recruitment.css';
import '@/styles/techniques/techniques.css';
import '@/styles/music/music.css';
import '@/styles/farming/farming.css';
import '@/styles/stages/stages.css';
import '@/styles/stages/stages-terminal.css';
import '@/styles/enemies/enemies.css';
import '@/styles/home/front.css';
import '@/styles/community/community.css';
import '@/styles/survey/boxplot.css';
import '@/styles/gacha/future.css';
import '@/styles/community/video.css';
import '@/styles/maps/world.css';
import '@/styles/survey/fragility.css';
import '@/styles/maps/terra.css';
import '@/styles/ui/price-display.css';
import '@/styles/gamemodes/gamemodes.css';
import SiteNav from '@/components/layout/Sitenav';
import MusicPlayer from '@/components/music/MusicPlayer';
import { MusicPlayerProvider } from '@/lib/music/musicPlayerContext';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import type { PageWithMobileNav } from '@/lib/nav/mobileNavOverride';

export default function App({ Component, pageProps }: AppProps) {
  // Dedicated compact tools declare their layout before the server's first paint.
  const hideSiteChrome = (Component as typeof Component & { hideSiteChrome?: boolean }).hideSiteChrome === true;
  const logoPath = getEssentialIconPath('Arkpedia');
  /* NEXT_PUBLIC_SITE_URL if someone sets it, else the deployment Vercel is building.
     Both are absent in local development, where link previews are not a thing. */
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '');
  const ogImage = origin && logoPath ? `${origin}${logoPath}` : '';
  return (
    <ContentContext.Provider value={pageProps.__contentRelease ?? null}>
    <ContentTablesContext.Provider value={pageProps.__contentTables ?? {}}>
    <MusicPlayerProvider>
      {/* Next injects a bare `width=device-width` on its own, with no
          initial-scale. That is the pair iOS Safari reads together when it
          decides the scale to restore after a rotation, and without the second
          half it can come back zoomed in, leaving the fixed nav bar wider than
          the window. Its own Head, not the one below: that one only renders
          when a logo path resolved, and the viewport is not optional.
          Deliberately no viewport-fit=cover -- it would hand the page the
          notch's area on every route at once, and nothing here pads for
          safe-area insets yet. */}
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* The site's fallback identity.
            Almost no page set a title or a description, so a tab, a search result and
            a link pasted into Discord all fell back to the bare URL. A page that knows
            better overrides these from its own Head, which wins because Next keeps the
            last tag of each kind; everything else at least says what site it is.
            og:image is the logo rather than a wide banner: there is no per-page art to
            point at, and a square mark reads better in a small preview card than a
            stretched screenshot would. */}
        <title>Arkpedia</title>
        <meta
          name="description"
          content="An Arknights reference: operators, skins, enemies, stages, base planning and the current event schedule."
        />
        <meta property="og:site_name" content="Arkpedia" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Arkpedia" />
        <meta
          property="og:description"
          content="An Arknights reference: operators, skins, enemies, stages, base planning and the current event schedule."
        />
        <meta name="twitter:card" content="summary" />
      </Head>
      {logoPath && (
        <Head>
          <link rel="icon" href={logoPath} />
          {/* Absolute, because a preview card is fetched by someone else's server and a
              relative path means nothing to it. The origin comes from Vercel at build
              time rather than being hardcoded, so a preview deployment advertises its
              own art and not production's. Omitted entirely when neither is set: a
              missing og:image just means no thumbnail, while a broken one is a broken
              card. */}
          {ogImage && <meta property="og:image" content={ogImage} />}
        </Head>
      )}
      {/* First tab stop on every page -- lets keyboard users jump the nav.
          The target is a plain focusable wrapper, not a <main>, because many
          pages render their own <main> inside it. */}
      <a href="#page-content" className="skip-link">Skip to content</a>
      {!hideSiteChrome && <div className="scanbar" />}
      {/* AnnouncementTicker is mounted inside SiteNav now, not here --
          see the Sitenav.tsx patch notes. That keeps it covered by the
          nav's own ResizeObserver-driven spacer, so it displaces page
          content correctly on every route, not just the home page. */}
      {/* A page may replace the phone's bar with one of its own by hanging a
          `mobileNav` property on its component -- see lib/nav/mobileNavOverride.ts for
          why it is declared by the page rather than sniffed for by the nav. Read here
          because this is the only place the page's component is a value rather than
          rendered output. It is part of the server render, so the bar is right on the
          first paint; a body class set from an effect would have flashed the wrong one.
          Pages that set nothing get undefined and the bar they always had. */}
      {!hideSiteChrome && <SiteNav mobileNav={(Component as PageWithMobileNav).mobileNav} />}
      <div id="page-content" tabIndex={-1} style={{ outline: 'none' }}>
        <Component {...pageProps} />
      </div>
      {!hideSiteChrome && <MusicPlayer />}
    </MusicPlayerProvider>
    </ContentTablesContext.Provider>
    </ContentContext.Provider>
  );
}
