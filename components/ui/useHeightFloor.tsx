import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A container that holds the reader's place through a collapse -- and hands the
 * space back afterwards.
 *
 * Site-wide since 2026-09-25 (it was the planner's): use it for a tab switch, a
 * "show less", a collapsing panel -- any state change inside one container that can
 * make the document shorter than the reader's scroll position needs. Not for a
 * search that narrows a long list to a few rows (see the arkpedia-ui skill).
 *
 *     const floor = useHeightFloor(logicalPageKey);
 *     <div ref={floor.ref}>{content}{floor.spacer}</div>
 *
 * The Anti-Page-Jump rule, as the one shape the planner needed it in. Four things
 * here can remove content: `All N materials` narrowing back to the short ones,
 * `Hide them` collapsing eleven roster rows, closing an operator's editor, and
 * the depot folding ninety-three tiles back to a strip. Each drops the
 * document's height, and when it drops below what the reader's scroll position
 * needs the browser clamps the scroll -- everything above the change lurches up
 * the screen, which reads as the page moving on its own.
 *
 * THIS USED TO HOLD THE TALLEST HEIGHT THE PANEL HAD EVER BEEN, for the life of
 * the plan. That does stop the jump, and it was the wrong trade: pressing
 * `Hide them` and then `Show them` left `Your plan` pinned at 927px with 742px
 * of nothing under its one remaining row, measured, and no scrolling or further
 * toggling ever gave it back. The reader asked for the space back and the rule
 * kept it. A floor that is never released is not a fix, it is the same lurch
 * spent as dead space instead.
 *
 * So the reserve is only ever what THIS reader's position needs right now:
 *
 *     reserve = (scrollY + innerHeight) - naturalDocumentHeight
 *
 * worked out fresh against the present state rather than summed, so it also
 * corrects an earlier over-reserve. At the top of the page that is zero and the
 * panel collapses at once, which is what pressing `Hide them` is asking for.
 * Two screens down it is exactly the shortfall, so nothing moves. Then it melts
 * as the reader scrolls up -- each release lands the document exactly at their
 * viewport's bottom edge, so there is never a clamp to correct and never a
 * second jump.
 *
 * WHY THE MEASUREMENT IS TAKEN ON THE CLICK. By the time a layout effect runs
 * the browser may already have clamped `scrollY`, and the number worth
 * defending is the one from before. A document-wide `pointerdown`/`keydown` in
 * the capture phase records it -- every one of these collapses is a press, and
 * capturing the interaction rather than each toggle means a new toggle inside
 * one of these panels is covered without anybody remembering to wire it up.
 *
 * The reserve is a SPACER rather than padding on the container. `.plan-panel-body`
 * already carries 16px of bottom padding, and writing a reserve over it makes a
 * small shrink end up shorter than it started -- jumping harder than doing
 * nothing. A spacer cannot clobber a value it does not touch.
 *
 * `resetKey` is the logical page. Pass something that changes when the panel is
 * about to be about something else -- a different plan, a different operator --
 * and not when a toggle flips, or the reserve is released exactly when it is
 * needed.
 */
export function useHeightFloor(resetKey: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [reserve, setReserve] = useState(0);
  /* The state, readable from listeners that were registered once. */
  const reserveRef = useRef(0);
  reserveRef.current = reserve;
  /** The bottom edge of the reader's viewport, live. */
  const bottomRef = useRef(0);
  /**
   * The same edge, read in the capture phase of the press that is about to
   * shorten the page -- and kept separately, because the live one is not
   * trustworthy by the time we need it.
   *
   * Measured: hiding eleven rows from the bottom of the page moved the panel
   * head 726px up the screen even with this hook in place. The browser clamps
   * the scroll during the layout that follows the change AND dispatches the
   * scroll event for it before the layout effect runs, so the live reading had
   * already collapsed to the post-clamp value and the reserve worked out to
   * nothing. The press happens before any of that, which is the whole reason
   * the site's rule says to capture in the handler.
   */
  const pressRef = useRef(0);
  /** Where the page was scrolled at that press. */
  const pressYRef = useRef(0);
  /**
   * A position to put back once the reserve exists to hold it.
   *
   * The clamp cannot be got ahead of from here: React commits the shortened DOM
   * and the browser clamps in the same layout, before any effect of ours runs.
   * So the reserve arrives one pass late, and on its own that is not enough --
   * the reader has already been moved, and the next pass reads their new
   * position and gives the space straight back. Reserving and restoring
   * together is what actually holds the place, and the restore happens in a
   * layout effect, before paint, so the moved state is never drawn.
   */
  const restoreRef = useRef<number | null>(null);
  /** This element's own height, with any reserve taken back off, so a shrink of
   *  the CONTENT can be told from the reserve being released. */
  const ownRef = useRef(0);

  /**
   * Reserve what the recorded position needs, or give back what it does not.
   * `grow` is false for a release-only pass, so a panel that did not lose
   * anything cannot take the space owed by the one that did.
   */
  const settle = useCallback((grow: boolean) => {
    /* Growing defends the position the reader was at when they pressed;
       releasing answers to where they are now. */
    const bottom = grow ? Math.max(pressRef.current, bottomRef.current) : bottomRef.current;
    const natural = document.documentElement.scrollHeight - reserveRef.current;
    const wanted = Math.max(0, Math.round(bottom - natural));
    const next = grow ? wanted : Math.min(wanted, reserveRef.current);
    if (next === reserveRef.current) return;
    if (grow && next > reserveRef.current && window.scrollY < pressYRef.current) {
      restoreRef.current = pressYRef.current;
    }
    reserveRef.current = next;
    setReserve(next);
  }, []);

  useEffect(() => {
    const note = () => { bottomRef.current = window.scrollY + window.innerHeight; };
    /* A scroll is the reader moving: record it and release against it.

       It also retires the press reading, unless the scroll left the reader at the foot
       of the document, which is where the browser's clamp always leaves them. A press
       only describes the collapse it came before; once the reader has scrolled away
       from it, a later shrink restored them to where they pressed. Measured on the
       gacha simulator: open the history, read to its end, collapse it, then scroll
       up. The reserve released, and when it reached nothing the spacer came out, the
       history section's 36px bottom margin collapsed through the container, the
       container read 36px shorter, and that "shrink" put the reader back at 1017
       every second wheel step. A touch that starts a scroll, and Space or Page Down,
       are presses too, so their readings went stale the same way. */
    const onScroll = () => {
      note();
      if (bottomRef.current < document.documentElement.scrollHeight - 2) {
        pressRef.current = 0;
        pressYRef.current = 0;
      }
      settle(false);
    };
    /* A press is the last honest reading before a collapse. Capture phase, so it
       lands before React's own handler runs and changes the layout. `click` as
       well as `pointerdown`, so a button activated from the keyboard -- which
       fires no pointer event -- is covered too. */
    const onPress = () => { note(); pressRef.current = bottomRef.current; pressYRef.current = window.scrollY; };
    note();
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onPress, true);
    document.addEventListener('click', onPress, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('keydown', onPress, true);
      document.removeEventListener('click', onPress, true);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [settle]);

  /* Before the browser paints the shortened page, so the short state is never
     drawn and there is no clamp to race. Every render, because the collapses
     this defends against are all state changes in the owning component. It sets
     state only when the reserve changes, and each pass moves it to the value the
     next pass computes, so the chain settles in one or two passes. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render, on purpose (above)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* The reserve from the previous pass is in the DOM now, so the position it
       was reserved for is reachable again. Instant, and before paint. */
    if (restoreRef.current !== null) {
      const want = restoreRef.current;
      /* html and body carry min-height: 100vh, so while the content is shorter than
         the viewport the document does not grow by the reserve: the spacer fills the
         min-height's slack first. `scrollHeight - reserve` then overstates the
         natural height and the reserve comes out short -- measured on the operator
         guesser, a 104px reserve left the document at exactly 900px and the reader
         at 0. Top up by what is still missing and try again on the next pass; each
         pass adds exactly the shortfall, so it settles in one or two. */
      const short = Math.ceil(want + window.innerHeight - document.documentElement.scrollHeight);
      if (short > 0) {
        // A short panel can sit inside the document's 100vh minimum. Adding
        // only the few clamped pixels repeatedly never reaches the slack before
        // React's update limit. Cover that slack in this pass; settle() releases
        // any excess when later content also contributes to the document height.
        const viewportSlack = Math.max(0, window.innerHeight - (el.getBoundingClientRect().bottom + window.scrollY));
        reserveRef.current += short + Math.ceil(viewportSlack);
        setReserve(reserveRef.current);
        return;
      }
      restoreRef.current = null;
      if (window.scrollY < want) window.scrollTo(0, want);
      bottomRef.current = window.scrollY + window.innerHeight;
    }
    const own = el.getBoundingClientRect().height - reserveRef.current;
    const shrank = own < ownRef.current - 0.5;
    ownRef.current = own;
    settle(shrank);
  });

  useEffect(() => {
    /* The content's height as it stands, not 0. This effect runs after the layout
       effect of the same commit, so zeroing it here erased the measurement that
       commit had just taken: when nothing re-rendered before the first collapse
       (the recruitment guesser's first "Reveal answers" after a new question), the
       collapse compared against 0, never read as a shrink, and the reader was
       clamped up the page -- 67px at 1440, 83px at 390, measured. */
    ownRef.current = ref.current ? ref.current.getBoundingClientRect().height - reserveRef.current : 0;
    reserveRef.current = 0;
    setReserve(0);
    pressRef.current = 0;
    pressYRef.current = 0;
    restoreRef.current = null;
  }, [resetKey]);

  return {
    ref,
    /** Render as the container's LAST child. Nothing at all when the reader's
     *  position does not need defending, which is most of the time. */
    spacer: reserve > 0 ? <div aria-hidden="true" style={{ height: reserve }} /> : null,
  };
}
