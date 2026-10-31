import { Html, Head, Main, NextScript } from 'next/document';
import { COMPANION_PAGE } from '@/lib/gamemodes/companionRoute';
import { THEME_COLOR } from '@/lib/nav/themeColor';
import { assetRetryScript } from '@/lib/assets/assetRetry';
import { pageAssetRecoveryScript } from '@/lib/assets/pageAssetRecovery';
import { ACCOUNT_STORAGE_KEY } from '@/lib/account/accountStore';
import { SITE_SERVER_KEY } from '@/lib/time/siteServer';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: pageAssetRecoveryScript() }} />
        {/* The webfonts are not linked here: pages/_app.tsx imports them, self-hosted. */}
        {/* Matches --bg, the page's own ground: browser chrome (mobile URL bar, PWA
            title bar) continues the page instead of drawing a band of a colour no
            token names. THEME_COLOR in lib/nav/themeColor.ts is the one source;
            ThemeToggle and the boot script below keep it in step with the theme. */}
        <meta name="theme-color" content={THEME_COLOR.dark} />
        {/* "Add Arkpedia as a search engine": public/opensearch.xml points the browser at
            /search?s=, the site search's own query URL (pages/search.tsx). */}
        {/* Every page's art comes from the asset host (config/asset-delivery.json); the hero
            image's preload is the first request to it, so open the connection with the HTML. */}
        <link rel="preconnect" href="https://assets.arkpedia.net" />
        <link rel="search" type="application/opensearchdescription+xml" title="Arkpedia" href="/opensearch.xml" />
        {/* A published picture that GitHub falsely answers 404 for is asked for again at
            another encoding of its address (lib/assets/assetRetry.ts). Here, before <body>,
            because operator icons fail while the HTML is still being read, before React runs. */}
        <script dangerouslySetInnerHTML={{ __html: assetRetryScript() }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem(${JSON.stringify(SITE_SERVER_KEY)});if(!s){var a=JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_STORAGE_KEY)})||'null');s=a&&a.server;}if(s==='jp'||s==='kr'){document.documentElement.setAttribute('data-site-server',s);}}catch(e){}try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',${JSON.stringify(THEME_COLOR.light)});}}}catch(e){}})();`,
          }}
        />
      </Head>
      <body>
        {/* The pop-out flag, decided before the first paint.
            ?popout=1 strips the site's furniture off the companion, and the class
            that does it goes on from an effect -- a frame or more after the browser
            has already painted the page WITH its nav, its heading and its paragraph
            of description. Measured at load, three fresh profiles out of three: the
            full page. A tab opened to play beside a game should not flash a website
            first.
            Same shape and the same reason as the theme script in the head above.
            Inside <body> rather than in the head because it needs document.body,
            which the parser has by the time it reaches this line.
            Scoped to the one page whose CSS reads the class. On the parameter alone
            any address on the site could strip its own chrome, and nothing would
            ever put it back: only the companion page runs the effect that takes the
            class off again. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname.indexOf(${JSON.stringify(COMPANION_PAGE)})===0&&new URLSearchParams(location.search).get('popout')==='1'){document.body.classList.add('gm-popout');}}catch(e){}})();`,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
