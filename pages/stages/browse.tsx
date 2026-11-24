import { useContentUrl } from '@/lib/content/context';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import StageList from '@/components/stages/StageList';
import PageHeader from '@/components/ui/PageHeader';
import StageTitle from '@/components/stages/StageTitle';
import { useEffect, useRef, useState } from 'react';
import { getStageTypeCounts } from '@/lib/stages/stages';
import { TYPE_LABELS } from '@/lib/stages/stageTypes';
import { fetchAsset } from '@/lib/assets/assetRetry';
import StageDetailPanel, { type StageDetailData } from '@/components/stages/StageDetailPanel';

interface Props {
  typeCounts: Record<string, number>;
  /** The request's clock, in unix seconds. */
  now: number;
}

/**
 * The detail column's height, held across a stage change while the reader is down the
 * page, and handed back as they scroll up.
 *
 * Picking a stage from the pinned rail two screens down usually swaps in a shorter one.
 * The document then fell short of the reader's position, the browser clamped the
 * scroll, and the rail -- which is sticky INSIDE the two-pane grid -- was pushed up the
 * screen with its short containing block: 120px in the review (2026-09-25, UC-10),
 * 155px measured here. The panel's own floor (reservedDetailHeight) cannot help: the
 * panel is keyed on the slug and starts fresh for each stage.
 *
 * Why a min-height on the grid cell rather than components/ui/useHeightFloor's spacer:
 * the rail is often the taller pane, so a spacer's height disappears into the grid row
 * instead of growing the page (measured: 155px reserved, 58px of it absorbed), and a
 * spacer below the grid gives the sticky rail nothing to travel through. A min-height
 * on the cell lengthens the grid itself, which is the rail's containing block.
 *
 * The amount is worked out fresh, never summed: on a change it is what the old stage
 * measured (read by a ResizeObserver, whose last reading is still the old stage's when
 * this layout effect runs); on every scroll it is what the reader's position needs --
 * the document reaching the bottom of the viewport -- and never more, so it melts away
 * as they climb and is gone at the top, where nothing needs holding.
 */
function useStageSwitchFloor(stageKey: string | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [floor, setFloor] = useState(0);
  const floorRef = useRef(0);
  floorRef.current = floor;
  /** The cell's height as last laid out: the outgoing stage's, when a new one mounts. */
  const lastRef = useRef(0);
  /** Where the reader was, from the last scroll event: a layout effect that reads
   *  window.scrollY after a shrink can already see the clamped value. */
  const lastYRef = useRef(0);
  /** A position to put back once the floor that holds it is in the DOM. */
  const restoreRef = useRef<number | null>(null);
  const restoreForRef = useRef(0);

  /** What the reader standing at `y` needs from this cell: the document has to reach
   *  the viewport's bottom edge. Everything below the cell is unaffected by it. */
  const needsAt = (el: HTMLElement, y: number) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    /* Below the GRID, not below the cell: the cell is only as tall as its content
       (align-items: start), and when the rail is the taller pane the gap between them
       is grid, which the cell's min-height takes up before it grows the page. */
    const grid = (el.parentElement ?? el).getBoundingClientRect();
    const below = document.documentElement.scrollHeight - (grid.bottom + window.scrollY);
    const content = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
    return { needs: Math.round(y + window.innerHeight - top - below), content };
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    lastYRef.current = window.scrollY;
    const ro = new ResizeObserver(() => { lastRef.current = el.getBoundingClientRect().height; });
    ro.observe(el);
    const onScroll = () => {
      lastYRef.current = window.scrollY;
      if (!floorRef.current) return;
      const { needs, content } = needsAt(el, window.scrollY);
      const next = needs <= content ? 0 : Math.min(floorRef.current, needs);
      if (next !== floorRef.current) setFloor(next);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);

  /* Before paint, so the short page is never drawn. The floor is the outgoing stage's
     height, capped at what the reader's position needs; at the top of the page that is
     nothing. */
  const firstRef = useRef(true);
  useClientLayoutEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    const el = ref.current;
    if (!el) return;
    const y = lastYRef.current;
    const { needs, content } = needsAt(el, y);
    const next = y <= 0 || needs <= content ? 0 : Math.min(Math.round(lastRef.current), needs);
    if (next !== floorRef.current) setFloor(next);
    if (next) { restoreRef.current = y; restoreForRef.current = next; }
  }, [stageKey]);
  /* The browser may have clamped before the floor arrived; put the reader back, in the
     same frame, once it has. Instant, never smooth. */
  useClientLayoutEffect(() => {
    /* Only once this render carries the floor: in the pass that set it, the page is
       still short and a scroll would be clamped straight back. */
    if (restoreRef.current === null || floor !== restoreForRef.current) return;
    const y = restoreRef.current;
    restoreRef.current = null;
    if (window.scrollY < y) window.scrollTo(0, y);
  });

  return { ref, style: floor ? { minHeight: floor } : undefined };
}

/**
 * The Terminal's stage view: the rail once, and whichever stage the URL names.
 *
 * This was 3,786 pre-rendered pages, one per stage, each embedding the whole
 * rail beside the single stage it was about -- the same shape the enemy
 * handbook had, and about 300 MB of near-duplicate HTML per build. It is one
 * page with the selection in the URL now (?s=<slug>), and each stage's data
 * arrives as a static file written by scripts/build-stage-details.ts.
 */
export default function StagesBrowsePage({ typeCounts, now }: Props) {
  const contentUrl = useContentUrl();
  const router = useRouter();
  /* The stage the address names: undefined until the router has read the address, null
     when it names none. A static page's first render has no query, even at
     ?s=pa-1, so the slug is only worked out once router.isReady. It used to fall back
     to the index's first stage (AD-EX-1) meanwhile, which fetched that stage's file on
     every deep link and scoped the rail to Act or Die for good. Without ?s= no stage
     is opened: the rail opens on what is running and the pane asks for a pick.
     Worked out only after mount, too: the server prerenders with isReady false, but at
     a bare /stages/browse (no query to wait for) the browser's router is ready on its
     first render, so that render said "Pick a stage" over the server's "Loading..." and
     React threw the markup away (#425/#418/#423; request-clock.spec.ts). */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const asked = typeof router.query.s === 'string' && router.query.s ? router.query.s : null;
  const slug = mounted && router.isReady ? asked : undefined;
  const [detail, setDetail] = useState<StageDetailData | null>(null);
  const [failed, setFailed] = useState(false);
  const switchFloor = useStageSwitchFloor(detail?.stage.slug ?? null);

  useEffect(() => {
    if (!slug) {
      setDetail(null);
      setFailed(false);
      return;
    }
    let live = true;
    setFailed(false);
    fetchAsset(contentUrl(`/stage-detail/${encodeURIComponent(slug)}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: StageDetailData) => { if (live) setDetail(d); })
      .catch(() => { if (live) { setDetail(null); setFailed(true); } });
    return () => { live = false; };
  }, [slug, contentUrl]);

  /* Named for the stage on screen. Every one of these 3,786 URLs used to serve
     the same empty title -- the only <title> a crawler found was an SVG label
     inside the map. */
  const title = detail
    ? `${detail.stage.code || detail.stage.name || detail.stage.slug} -- Stage -- Arkpedia`
    : 'Stages -- Arkpedia';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content={detail
            ? `${[detail.stage.code, detail.stage.name].filter(Boolean).join(' ')}: map, enemies, drops and wave order.`
            : 'Every Arknights stage, with its map, enemies and drops.'}
        />
      </Head>
      {/* Two lines, wide-aligned with the panes below. The full site header ran
          184px tall on a page whose left column wants every pixel of viewport it
          can get. */}
      {detail ? (
        <PageHeader
          slim
          /* The crumbs are the way back: the chapter or event is a page of its own --
             its stages as cards -- so the crumb that names it goes there. A stage
             whose content the dataset does not name keeps the plain text. There used
             to be a separate "< chapter" link above this saying the same thing. */
          eyebrow={<>
            Rhodes Island // <Link prefetch={false} href="/stages">Stages</Link>{' // '}
            {detail.stage.content?.id ? (
              <Link prefetch={false} href={`/stages/content/${detail.stage.content.id}`}>{detail.stage.content.name}</Link>
            ) : (
              detail.stage.zone?.name || TYPE_LABELS[detail.stage.stage_type] || detail.stage.stage_type
            )}
          </>}
          /* 166 mode levels have no code and 306 no name, and one stage
             (level_rogue4_b-9) has neither -- it rendered an empty heading. Fall back
             the way the list rows do, so a page always says what it is. stageTitle()
             puts a real space between code and name: they used to run together as
             "AD-EX-1Dusty Prop Room" for screen readers and copy/paste. */
          title={<StageTitle code={detail.stage.code} name={detail.stage.name} fallback={detail.stage.slug} lead="code" />}
        />
      ) : (
        <PageHeader slim eyebrow={<>Rhodes Island // <Link prefetch={false} href="/stages">Stages</Link></>} title="Stages" />
      )}

      <main>
        {/* Same two panes as before: the rail keeps its place on the left and the
            stage fills the column beside it. The rail is rendered once now
            instead of once per stage. */}
        <div className="stage-shell">
          <StageList typeCounts={typeCounts} now={now} selectedSlug={slug} />
          {/* The detail column's cell, holding the height the last stage had while
              the reader is down the page (useStageSwitchFloor). */}
          <div className="stage-detail-slot" ref={switchFloor.ref} style={switchFloor.style}>
            {detail ? (
              /* Keyed on the slug so the panel's own state -- playback, open
                 cards, the variant toggle -- starts fresh for each stage. */
              <StageDetailPanel key={detail.stage.slug} {...detail} now={now} />
            ) : (
              <div className="stage-detail-col">
                <p className="hint">
                  {slug === null ? 'Pick a stage from the list.' : failed ? 'That stage could not be loaded.' : 'Loading...'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/browse", async () => ({
  props: {
    // No rows and no default stage: which stage is open is in the address, which the
    // build cannot see, so the rail's rows come from /stages-index.json on mount and
    // the stage from its own file (see the page). `now` is the request's, from
    // contentPageClock (lib/content/pageClock.ts).
    typeCounts: getStageTypeCounts(),
  },
}), {
  tables: {
    'stage-tile-legend': async () => (await import('@/data/stage-tile-legend.json')).default,
    // The stage rail's filter headings (components/stages/StageList.tsx).
    'stages-content': async () => (await import('@/data/stages-content.json')).default,
    'content-windows': async () => (await import('@/data/content-windows.json')).default,
    'story-groups': async () => (await import('@/data/story-groups.json')).default,
  },
});
