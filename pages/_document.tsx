import { Html, Head, Main, NextScript } from 'next/document';
import { COMPANION_PAGE } from '@/lib/gamemodes/companionRoute';
import { THEME_COLOR } from '@/lib/nav/themeColor';
import { assetRetryScript } from '@/lib/assets/assetRetry';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          /* JetBrains Mono carries 600 and 700 because the stylesheets ask for them:
             39 rules across styles/ set a mono font-weight of 600 or 700, and with
             only 400 and 500 loaded every one of those was being SYNTHESISED -- the
             browser smearing the 400 sideways. At the sizes this site uses mono, 9px
             to 15px, that is not a heavier letter, it is a blurred one: the m of
             "37m" in the nav's reset countdown merged into a solid block and read as
             a missing-glyph box. Rajdhani already loads every weight it is asked for.
             Inter carries 600 and 700 for the same reason: the operator pages, /skins,
             /schedule, /farming and the games ask for them (1,100+ characters on one
             operator page), and with only 400/500 loaded every one was faux bold.
             npm run audit:styles reads this URL and fails a rule that asks any of the
             three families for a weight it does not list. */
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Matches --bg, the page's own ground: browser chrome (mobile URL bar, PWA
            title bar) continues the page instead of drawing a band of a colour no
            token names. THEME_COLOR in lib/nav/themeColor.ts is the one source;
            ThemeToggle and the boot script below keep it in step with the theme. */}
        <meta name="theme-color" content={THEME_COLOR.dark} />
        {/* A published picture that GitHub falsely answers 404 for is asked for again at
            another encoding of its address (lib/assets/assetRetry.ts). Here, before <body>,
            because operator icons fail while the HTML is still being read, before React runs. */}
        <script dangerouslySetInnerHTML={{ __html: assetRetryScript() }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',${JSON.stringify(THEME_COLOR.light)});}}}catch(e){}})();`,
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