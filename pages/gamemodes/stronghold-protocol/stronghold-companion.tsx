import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  StrongholdData,
  alliancesForPicker,
  strongholdData,
} from '@/lib/gamemodes/stronghold';
import { assertPlaybook, buildableAlliances } from '@/lib/gamemodes/strongholdPlaybook';
import { assertOpening } from '@/lib/gamemodes/strongholdOpening';
import StrongholdCompanion, { type CompanionProps } from '@/components/StrongholdCompanion';
import { isCompanionPopout } from '@/lib/gamemodes/companionRoute';

type Props = CompanionProps & { data: StrongholdData };

/**
 * The companion as a page of its own.
 *
 * Three ways in, and they want two different amounts of page around the companion.
 *
 * A phone simply navigates here and gets the whole thing: heading, back link, site
 * nav, and the companion under them. So does anyone arriving on the bare address.
 *
 * The New tab button appends ?popout=1, and that strips the lot -- nav, scanbar,
 * player, heading -- leaving the companion full-bleed and full-height. A tab opened
 * to play beside the game is not a page of the website and should not be dressed as
 * one; it is closed rather than navigated away from, the way its pop-out window
 * ancestor was. (Chromium's Stronghold page has a third way, Picture-in-Picture,
 * which never comes here at all: it draws the companion in a window of its own.)
 */
export default function CompanionPage({ data, picker }: Props) {
  /* ?popout=1 strips the site's shell. The class does the hiding, on <body> because
     the nav, the scanbar and the player are drawn by _app, above anything this page
     renders -- and the heading is this page's own, hidden by the same class.
     Cleared on unmount: client-side navigation keeps the body.

     Off location, not off the router. On a statically generated page router.query is
     empty for the first client render and fills in a render later, so `mini` would
     start false -- and this effect would take the class straight back off the body
     that _document's boot script had just put on it, which is the flash that script
     exists to prevent. location.search is right there on the first effect pass.
     `toggle` rather than `add` so it is idempotent over the boot script, and so the
     bare address still clears a class left by something else.

     State as well, because the note below is RENDERED from this and the server has no
     URL to agree with: false is what the server's HTML says and what the first client
     render has to say back. The class does not wait for that state to land -- it is
     set here, from the same read. */
  const [mini, setMini] = useState(false);
  useEffect(() => {
    const isMini = isCompanionPopout(window.location.search);
    setMini(isMini);
    document.body.classList.toggle('gm-popout', isMini);
    return () => document.body.classList.remove('gm-popout');
  }, []);

  /* And the page marks itself either way, so the companion's sticky top bar can
     duck under the site's fixed mobile nav instead of sliding behind it. */
  useEffect(() => {
    document.body.classList.add('gm-companionpage');
    return () => document.body.classList.remove('gm-companionpage');
  }, []);

  /**
   * The one thing a reader who took the tab has to be told once: it will not stay
   * above the game. Only Chromium's Document Picture-in-Picture does that, and it is
   * offered right beside the button they pressed, so this is a signpost rather than
   * bad news. Said here, because the button's tooltip is hover-only and nobody hovers
   * -- and said once, because a note that reappears every run is nagging.
   */
  const [ontopNoted, setOntopNoted] = useState(true);
  useEffect(() => {
    if (!mini) return;
    try {
      setOntopNoted(window.localStorage?.getItem('gm-co-ontop-noted') === '1');
    } catch { /* private mode reads as un-noted every time, which is fine */ }
  }, [mini]);
  const noteOntop = () => {
    setOntopNoted(true);
    try { window.localStorage?.setItem('gm-co-ontop-noted', '1'); } catch { /* ignore */ }
  };

  return (
    <>
      <Head>
        <title>Stronghold companion — Arkpedia</title>
        <meta
          name="description"
          content="A one-screen companion for a Stronghold Protocol run: the enemies you drew, the plan for each alliance you are building, and what your board can already do."
        />
      </Head>

      {/* gm-co-head / gm-co-page: markup classes, not the body.gm-companionpage the
          rest of this page uses. That one is added by an effect, so anything hung on
          it renders once and then disappears -- and what is being hung on these is a
          150px block of heading. The reader would watch the whole companion jump up
          the screen a moment after every load. These are in the server markup, so
          the first paint is already right. */}
      <div className="terminal-head gm-co-head">
        <Link prefetch={false} href="/gamemodes/stronghold-protocol" className="stage-back">&lsaquo; Stronghold Protocol</Link>
        <div className="eyebrow">Rhodes Island // Game Modes</div>
        <h1>Run Companion</h1>
        <p className="sub">
          One screen for a run in progress. On a phone this page IS the companion;
          on a desktop the Stronghold page opens it in a window or a tab of its own.
        </p>
      </div>

      <main className="terminal-scene gm-co-page">
        <section className="terminal-panel wide" data-tab="Companion">
          {/* role=status: the note appears after render, once localStorage has been
              asked, so without a live region a screen reader never hears the one
              thing this surface has to say. */}
          {mini && !ontopNoted && (
            <p className="gm-co-ontopnote" role="status">
              {/* One span around the whole sentence, because the note is a flex row
                  (the OK button rides its right-hand end on margin-left:auto). Bare
                  text either side of the <b> would be three flex items, not one
                  sentence: it laid out as two columns with "On top" stranded in the
                  gap between them. */}
              <span>
                A tab can&rsquo;t sit above the game. On Chrome or Edge, the Stronghold
                page&rsquo;s <b>On top</b> button opens one that does &mdash; otherwise
                keep this on a second screen, or beside a windowed game.
              </span>
              <button type="button" onClick={noteOntop}>OK</button>
            </p>
          )}
          <StrongholdCompanion data={data} picker={picker} standalone />
        </section>
      </main>
    </>
  );
}

/**
 * The phone gets a bar of this page's own instead of the site's.
 *
 * On a phone this page IS the companion: it fills the screen and has no heading, and
 * what belongs at the top of it is the way back to Stronghold Protocol and how long is
 * left on the run's clock -- not the name of the website and the time of day. _app
 * reads this off the component and hands it to the nav; see
 * lib/nav/mobileNavOverride.ts for why the page declares it rather than the nav
 * recognising the route.
 *
 * A property rather than an import, so this file needs to know nothing about the nav
 * beyond the shape, and the nav needs to know nothing about this page at all.
 */
CompanionPage.mobileNav = {
  back: { href: '/gamemodes/stronghold-protocol', label: 'Stronghold' },
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  const data = strongholdData();
  /* Throws if the playbook names an operator, item, strategy or alliance the season
     does not have. Here rather than at runtime because the failure is silent
     otherwise: the name would match nothing and the advice would quietly omit it. */
  assertPlaybook(data);
  /* And the opening guide, which is the largest hand-written thing here and every
     line of it a name. */
  assertOpening(data);
  return { props: { data, picker: buildableAlliances(alliancesForPicker(data)) } };
};
