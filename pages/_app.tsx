import { ContentContext, ContentTablesContext } from '@/lib/content/context';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/site';
import { contentUrl } from '@/lib/content/urls';
import type { AppProps } from 'next/app';
import Head from 'next/head';
/* The three webfonts, served from the site itself (fontsource, SIL OFL: credited on /credits,
   lib/credits/fonts.ts). Until Next 15 the build inlined a Google Fonts stylesheet; since then a
   <link> to it loaded at runtime, so a page whose visitor (or CI runner) could not reach Google
   drew in fallback faces. Each import is one weight, every subset of it an @font-face with its
   unicode-range and font-display: swap, so a browser fetches only the subsets a page's text
   uses: latin, plus latin-ext, cyrillic, greek or vietnamese where album titles, lyrics, voice
   lines and stage text set them. Not the <subset>-<weight>.css files: those carry no
   unicode-range, so two subsets of one weight would both claim every character.
   JetBrains Mono carries 600 and 700 because the stylesheets ask for them:
   39 rules across styles/ set a mono font-weight of 600 or 700, and with
   only 400 and 500 loaded every one of those was being SYNTHESISED -- the
   browser smearing the 400 sideways. At the sizes this site uses mono, 9px
   to 15px, that is not a heavier letter, it is a blurred one: the m of
   "37m" in the nav's reset countdown merged into a solid block and read as
   a missing-glyph box. Rajdhani already loads every weight it is asked for.
   Inter carries 600 and 700 for the same reason: the operator pages, /skins,
   /schedule, /farming and the games ask for them (1,100+ characters on one
   operator page), and with only 400/500 loaded every one was faux bold.
   npm run audit:styles reads these imports and fails a rule that asks any of the
   three families for a weight not imported here, and a <subset>-<weight>.css import. */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@/styles/core/shared.css';
/* Straight after shared.css, which owns the tokens it reads, and before the 29
   feature stylesheets, so a page not yet migrated can still override a primitive
   with its own bespoke rule. */
import '@/styles/core/arkpedia-theme.css';
import '@/styles/core/nav.css';
import '@/styles/core/account-navigation.css';
import '@/styles/core/information.css';
import '@/styles/core/music-workspace.css';
import '@/styles/search/search.css';
import '@/styles/ui/ticker.css';
import '@/styles/base/base.css';
import '@/styles/schedule/events.css';
import '@/styles/gacha/gacha.css';
import '@/styles/gacha/gacha-tutorial.css';
import '@/styles/skins/skins.css';
import '@/styles/skins/skin-planner.css';
import '@/styles/operators/roster.css';
import '@/styles/operators/credits.css';
import '@/styles/operators/operator-detail.css';
import '@/styles/planner/planner.css';
import '@/styles/pulls/pulls.css';
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
import '@/styles/community/video.css';
import '@/styles/maps/world.css';
import '@/styles/ui/price-display.css';
import '@/styles/gamemodes/gamemodes.css';
import '@/styles/account/import.css';
import '@/styles/story/story.css';
import '@/styles/changelog/changelog.css';
import '@/styles/credits/credits.css';
import '@/styles/account/account.css';
/* Last: every transition and animation the site adds (r11 quiet polish), all under
   prefers-reduced-motion: no-preference. At equal specificity it beats the transitions
   the primitives and cards above already declare, which it restates with its own. */
import '@/styles/core/motion.css';
import SiteNav from '@/components/layout/Sitenav';
import AccountActions from '@/components/account/AccountActions';
import MusicPlayer from '@/components/music/MusicPlayer';
import RoamingChibiProvider from '@/components/operators/RoamingChibiProvider';
import { MusicPlayerProvider } from '@/lib/music/musicPlayerContext';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import type { PageWithMobileNav } from '@/lib/nav/mobileNavOverride';
import { watchImageArrivals } from '@/lib/ui/imageArrival';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { watchBrowserDataReset } from '@/lib/account/resetData';
import { useRouter } from 'next/router';
import { recordPage } from '@/lib/nav/pageTrail';
import { watchScrollRestoration } from '@/lib/nav/scrollRestoration';
import { watchPrivacyWithdrawal } from '@/lib/privacy/preferences';
import ExternalMediaPrompt from '@/components/privacy/ExternalMediaPrompt';
import StatisticsPrompt from '@/components/privacy/StatisticsPrompt';
import SiteAnalytics from '@/components/layout/SiteAnalytics';
import { CloudSyncProvider } from '@/lib/cloud-account/SyncProvider';
import { ReplayDownloadProvider } from '@/lib/replays/DownloadProvider';
import ReplayDownloadBar from '@/components/account-import/ReplayDownloadBar';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => watchPrivacyWithdrawal(), []);
  const [cloudRestoreVersion, setCloudRestoreVersion] = useState(0);
  const [resetting, setResetting] = useState(false);
  useEffect(() => watchBrowserDataReset(() => flushSync(() => setResetting(true))), []);
  // Dedicated compact tools declare their layout before the server's first paint.
  const hideSiteChrome = (Component as typeof Component & { hideSiteChrome?: boolean }).hideSiteChrome === true;
  /* The logo is art like any other: pinned to the page's content release rather than
     left as /essential-icons/..., which 307s to the asset commit of the last deploy.
     App renders the content provider, so it resolves with the page's release directly.
     The result is already absolute, which is what a link preview needs. */
  const logoPath = getEssentialIconPath('Arkpedia');
  const logoUrl = logoPath ? contentUrl(logoPath, pageProps.__contentRelease ?? null) : null;
  // Images that arrive from here on fade in (lib/ui/imageArrival.ts); an effect, so only
  // once the app has hydrated: what was already loaded, or already drawing, is simply shown.
  useEffect(() => watchImageArrivals(document), []);
  // The pages this tab has shown, for a detail page's Back (lib/nav/pageTrail.ts).
  const router = useRouter();
  // Keep the watcher across page transitions; it tracks its current URL internally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => watchScrollRestoration(router), [router.events]);
  useEffect(() => {
    recordPage(router.asPath);
    router.events.on('routeChangeComplete', recordPage);
    return () => router.events.off('routeChangeComplete', recordPage);
  // Once: the listener records every change after the first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.events]);
  if (resetting) return <p role="status">Clearing saved data…</p>;
  return (
    <ContentContext.Provider value={pageProps.__contentRelease ?? null}>
    <ContentTablesContext.Provider value={pageProps.__contentTables ?? {}}>
    <CloudSyncProvider onRestore={() => setCloudRestoreVersion(version => version + 1)}>
    <ReplayDownloadProvider>
    <MusicPlayerProvider>
    <RoamingChibiProvider>
    <AccountActions>
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
        {/* Keyed like PageMeta's (components/layout/PageMeta.tsx), so a page's own values
            replace these rather than join them: next/head drops a repeated <title> and
            <meta name>, but a repeated <meta property> only when both carry the same key. */}
        <title key="title">{SITE_NAME}</title>
        <meta key="description" name="description" content={SITE_DESCRIPTION} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content="website" />
        <meta key="og:title" property="og:title" content={SITE_NAME} />
        <meta key="og:description" property="og:description" content={SITE_DESCRIPTION} />
        <meta key="twitter:card" name="twitter:card" content="summary" />
      </Head>
      {logoUrl && (
        <Head>
          <link rel="icon" href={logoUrl} />
          {/* Absolute, because a preview card is fetched by someone else's server and a
              relative path means nothing to it. contentUrl gives the full address of the
              published file, the same one the favicon uses. */}
          <meta key="og:image" property="og:image" content={logoUrl} />
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
      {!hideSiteChrome && <ReplayDownloadBar />}
      <div id="page-content" tabIndex={-1} style={{ outline: 'none' }}>
        <Component key={cloudRestoreVersion} {...pageProps} />
      </div>
      {!hideSiteChrome && <MusicPlayer />}
      <ExternalMediaPrompt />
      <StatisticsPrompt />
      {process.env.ARKPEDIA_WEB_ANALYTICS === '1' && <SiteAnalytics />}
    </AccountActions>
    </RoamingChibiProvider>
    </MusicPlayerProvider>
    </ReplayDownloadProvider>
    </CloudSyncProvider>
    </ContentTablesContext.Provider>
    </ContentContext.Provider>
  );
}
