import { useContentUrl } from '@/lib/content/context';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import EnemyBrowser from '@/components/enemies/EnemyBrowser';
import EnemyDetailPanel, { type EnemyDetailData } from '@/components/enemies/EnemyDetailPanel';
import { getEnemyContents, getEnemySummaries } from '@/lib/enemies/enemies';
import { listedEnemies } from '@/lib/enemies/enemyListing';
import { EnemyContent, EnemySummary } from '@/lib/enemies/enemyTypes';
import { buildTechniqueGroups } from '@/lib/techniques/buildTechniqueGroups';
import { getAllOperators } from '@/lib/operators/operators';
import { releaseMarker } from '@/lib/operators/operatorAvailability';
import { buildEnemyStatusCandidates, selectEnemyStatusOperators, type EnemyStatusCandidates, type EnemyStatusOperatorMap } from '@/lib/enemies/statusOperators';
import PageHeader from '@/components/ui/PageHeader';

interface Props {
  /** Enough grid rows to paint immediately. The full 1,585 arrive from
   *  /enemies-index.json on mount, the same as before. */
  siblings: EnemySummary[];
  contents: EnemyContent[];
  /** What the page opens on when the URL names no enemy. */
  firstSlug: string;
  /** Who applies each status, released or not; chosen at render from `now`. */
  statusCandidates?: EnemyStatusCandidates;
  /** Releases exported before statusCandidates: the choice made at that export. */
  statusOperators?: EnemyStatusOperatorMap;
  /** The request's clock (contentPageClock), shared by the server render and hydration. */
  now: number;
}


/**
 * The handbook itself: the grid once, and whichever record the URL names.
 *
 * This was 1,585 pre-rendered pages, one per enemy, each of which embedded the
 * whole grid beside the single record it was about -- two of them measured
 * 99.7% identical at 71 KB apiece. It is one screen with a selection, so the
 * selection lives in the URL (?e=<slug>) and the record arrives as a static
 * JSON file written by scripts/build-enemy-details.mjs.
 */
export default function EnemiesPage({ siblings, contents, firstSlug, statusCandidates, statusOperators: exportedStatusOperators, now }: Props) {
  const statusOperators = useMemo(
    () => statusCandidates ? selectEnemyStatusOperators(statusCandidates, now) : exportedStatusOperators ?? {},
    [statusCandidates, exportedStatusOperators, now],
  );
  const contentUrl = useContentUrl();
  const router = useRouter();
  const slug = typeof router.query.e === 'string' && router.query.e ? router.query.e : firstSlug;
  const [detail, setDetail] = useState<EnemyDetailData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetch(contentUrl(`/enemy-detail/${encodeURIComponent(slug)}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EnemyDetailData) => { if (live) setDetail(d); })
      .catch(() => { if (live) { setDetail(null); setFailed(true); } });
    return () => { live = false; };
  }, [slug, contentUrl]);

  /* The record's own name, once it is known. Every one of these used to share a
     single title -- there were 1,585 URLs and not one of them said what it was. */
  const title = detail ? `${detail.enemy.name} -- Enemy -- Arkpedia` : 'Enemy handbook -- Arkpedia';

  /**
   * Locks the frame to the viewport, and publishes the nav's height for the CSS that
   * sizes it.
   *
   * The frame is a viewport minus the nav, which leaves the header above it as scroll
   * travel: scroll down and the title goes, the frame fills the screen, and there is
   * nothing beyond that to scroll to.
   *
   * On the PAGE rather than in EnemyDetailPanel, which is where it used to be, and that
   * was the bug behind the grid resetting. The panel is keyed on the slug, so choosing
   * an enemy unmounts one and mounts the next: the cleanup took the class off the body
   * and the new mount put it back, and in the moment it was off the grid pane lost
   * `overflow-y: auto` and with it its scroll offset. Measured: 600 before the click, 0
   * after, with the pane the same DOM node at the same size, so nothing about the
   * layout had changed. It also meant the Stronghold page, which renders the same
   * panel and does not want this layout, was getting it anyway.
   *
   * The nav's height has to be measured because the nav is position:fixed and its rows
   * can collapse as you scroll. This measures the SPACER Sitenav already keeps in flow
   * for exactly that height, rather than the frame's own offset, which moves after
   * mount.
   */
  useEffect(() => {
    document.body.classList.add('enemy-frame-lock');
    const spacer = document.querySelector<HTMLElement>('.site-nav-spacer');
    const publish = () => {
      const h = spacer?.offsetHeight;
      if (h) document.documentElement.style.setProperty('--enemy-nav-h', `${h}px`);
    };
    publish();
    const ro = spacer ? new ResizeObserver(publish) : null;
    if (spacer && ro) ro.observe(spacer);
    window.addEventListener('resize', publish);
    return () => {
      document.body.classList.remove('enemy-frame-lock');
      document.documentElement.style.removeProperty('--enemy-nav-h');
      ro?.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content={detail
            ? `${detail.enemy.name}: stats, resistances, skills and every stage it appears in.`
            : 'Every Arknights enemy, with stats, resistances and the stages they appear in.'}
        />
      </Head>
      {/* The page needs a title like every other section has one -- an eyebrow and
          an h1, the same shape as the operator roster. There is no breadcrumb: the
          grid beside this IS the handbook, so a link back led to the page you are
          already on. */}
      <PageHeader eyebrow="Rhodes Island // Threat Assessment" title="Enemy handbook" />
      {/* Locked to the viewport and sized from its own offset, so the nav can
          change height without this needing a new magic number. Below 900px the
          stylesheet lets the page scroll normally instead. */}
      <main className="enemy-page">
        <EnemyBrowser seed={siblings} contents={contents} selectedSlug={slug}>
          {detail ? (
            /* Keyed on the slug so the panel's own state -- level, tab, content
               picker -- starts fresh for each enemy instead of carrying the last
               one's choices over, which is what the in-render reset used to do. */
            <EnemyDetailPanel key={detail.enemy.slug} {...detail} statusOperators={statusOperators} />
          ) : (
            <p className="hint enemy-detail-loading">
              {failed ? 'That enemy could not be loaded.' : 'Loading...'}
            </p>
          )}
        </EnemyBrowser>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/enemies", async () => {
  const summaries = listedEnemies(getEnemySummaries());
  const first = summaries[0];
  // Released or not is decided at render (selectEnemyStatusOperators), never here.
  const releases = new Map(getAllOperators().map(operator => [operator.name, releaseMarker(operator)]));
  return {
    props: {
      // The grid's first paint. Everything else still comes from
      // /enemies-index.json on mount, so this is a seed and not the roster.
      siblings: summaries.slice(0, 40),
      contents: getEnemyContents(),
      firstSlug: first?.slug ?? '',
      statusCandidates: buildEnemyStatusCandidates(buildTechniqueGroups(), releases),
    },
  };
});
