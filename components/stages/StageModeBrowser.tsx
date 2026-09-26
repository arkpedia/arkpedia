import { useContentUrl } from '@/lib/content/context';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import ContentCardLink, { MinistoryMark, NoMapNote } from '@/components/ui/ContentCardLink';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { MODE_LABELS, MODE_ORDER, MODE_SHORT, StageModeCard, StageSummary } from '@/lib/stages/stageTypes';
import { compareStageSummaries } from '@/lib/stages/stageSort';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SearchInput from '@/components/ui/SearchInput';

interface Props {
  cards: StageModeCard[];
  counts: Record<string, number>;
  /** The build's clock in unix seconds, so the first client render agrees with
   *  the markup before an effect re-reads the reader's own. */
  now: number;
}

/** Rounded down to the minute, so re-reading it is a no-op for React unless a
 *  minute has passed. */
const nowSeconds = () => Math.floor(Date.now() / 60000) * 60;

/** Stage hits shown under the cards. A search here is for finding one stage,
 *  not for browsing a chapter -- that is what the cards are for. */
const STAGE_HITS = 30;

/** Cards per press. All 150 at once is 146 banner images, each one a request to
 *  the image optimizer and a decode -- on a phone that is the whole page's
 *  budget spent before you have scrolled. The cap is on what is RENDERED, not on
 *  what is filtered, so the count above the grid still speaks for the whole
 *  set. */
const CARD_PAGE = 24;

/** Which tab the reader is on, remembered across a click into a chapter and
 *  back. */
const STORE_KEY = 'arkpedia.stages.mode';

function year(release: string | null): string {
  return release ? release.slice(0, 4) : '';
}

/**
 * The stages landing page: the game's modes as tabs, and everything the game
 * runs as its own banner, newest first.
 *
 * This replaced a two-pane rail that opened on 600 of 4,130 rows -- a list of
 * stage codes with no way to see what an event was. The rail's one advantage was
 * that it could search every stage from the front page, so the search box here
 * still does that: it filters the cards as you type and, once the index has
 * arrived, lists the stages that match underneath.
 */
export default function StageModeBrowser({ cards, counts, now }: Props) {
  const contentUrl = useContentUrl();
  const [mode, setMode] = useState('');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(now);
  const { basePath } = useRouter();

  useEffect(() => {
    setClock(nowSeconds());
    try {
      const saved = sessionStorage.getItem(STORE_KEY);
      if (saved && (saved === '' || MODE_ORDER.includes(saved))) setMode(saved);
    } catch {
      // sessionStorage unavailable (private mode) -- the tab simply does not
      // carry across a click.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, mode);
    } catch {
      // as above
    }
  }, [mode]);

  // The 4,130-row index is 1.98MB, so it is fetched only once someone actually
  // searches -- the same file, and the same one-fetch-per-visit, the stage rail
  // used. Landing on this page downloads none of it.
  const [stages, setStages] = useState<StageSummary[] | null>(null);
  const wanted = search.trim().length > 0;
  useEffect(() => {
    if (!wanted || stages) return;
    let live = true;
    fetch(contentUrl(`${basePath}/stages-index.json`))
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        setStages((rows as StageSummary[]).slice().sort(compareStageSummaries));
      })
      .catch(() => {
        // Offline or blocked: the cards still filter, which is most of what the
        // box is for on this page.
      });
    return () => {
      live = false;
    };
  }, [contentUrl, wanted, stages, basePath]);

  const shown = useMemo(() => {
    const q = search.trim();
    return cards.filter((c) => {
      // A search looks at every mode, not at the tab in view -- the same rule the
      // stage rail follows for its chapter filter. Searching "1-7" from the
      // Annihilation tab found nothing, because the tab was still narrowing it.
      if (!q) return !mode || c.kind === mode;
      return matchesSearch(c.name, q) || matchesSearch(c.label, q) || matchesSearch(MODE_LABELS[c.kind] || '', q);
    });
  }, [cards, mode, search]);

  const stageHits = useMemo(() => {
    const q = search.trim();
    if (!q || !stages) return [];
    return stages
      .filter((s) => !s.variantOf && (matchesSearch(s.code || '', q) || matchesSearch(s.name || '', q)))
      .sort(
        (a, b) =>
          Math.min(searchRelevance(a.code || '', q), searchRelevance(a.name || '', q)) -
          Math.min(searchRelevance(b.code || '', q), searchRelevance(b.name || '', q))
      );
  }, [stages, search]);

  // Narrowing the set starts the count over: 24 of the 79 side stories is a
  // page you scroll, but 24 of the 3 that match a search is all of them.
  const [cardLimit, setCardLimit] = useState(CARD_PAGE);
  useEffect(() => {
    setCardLimit(CARD_PAGE);
  }, [mode, search]);
  const visible = shown.slice(0, cardLimit);

  const tabs = MODE_ORDER.filter((kind) => counts[kind]);

  return (
    <div className="stage-modes">
      {/* The site's one pick-one control. It was a primary/ghost strip, which paints
          the chosen tab in the teal fill reserved for primary actions. */}
      <SegmentedControl
        className="stage-mode-tabs"
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: '', label: 'All' },
          ...tabs.map((kind) => ({
            value: kind,
            label: MODE_SHORT[kind] || MODE_LABELS[kind] || kind,
            ariaLabel: MODE_LABELS[kind],
            title: MODE_LABELS[kind],
          })),
        ]}
      />

      <div className="stage-mode-searchrow">
        <SearchInput
          className="stage-mode-search"
          label="Search events, chapters and stages"
          placeholder="Search an event, chapter or stage code..."
          value={search}
          onChange={setSearch}
        />
        <span className="stage-count">
          {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="stage-mode-grid">
        {visible.map((card) => {
          const live = card.start && card.end && clock >= card.start && clock <= card.end;
          return (
            <ContentCardLink key={card.id} id={card.id} mapless={card.mapless} className="stage-mode-card">
              <span className="stage-mode-art">
                {card.art ? (
                  <Image
                    src={card.art}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 340px"
                    /* The optimizer answers 400 for a filename holding an
                       apostrophe at this version, whatever the encoding, and a
                       400 here is a blank card. */
                    unoptimized={card.artRaw}
                  />
                ) : (
                  <span className="stage-mode-art-none">{card.label || MODE_SHORT[card.kind] || '--'}</span>
                )}
                {live && <span className="badge-live stage-mode-live">Running now</span>}
                {card.mapless && <NoMapNote />}
                {card.ministory && <MinistoryMark />}
              </span>
              <span className="stage-mode-meta">
                <span className="stage-mode-line">
                  {card.label && <span className="stage-mode-code">{card.label}</span>}
                  <span className="stage-mode-name">{card.name}</span>
                </span>
                <span className="stage-mode-sub">
                  {MODE_LABELS[card.kind] || card.kind}
                  {' -- '}
                  {card.count} {card.count === 1 ? 'stage' : 'stages'}
                  {year(card.release) && ` -- ${year(card.release)}`}
                </span>
              </span>
            </ContentCardLink>
          );
        })}
        {shown.length === 0 && (
          <p className="hint stage-empty">
            {search.trim() ? 'No event or chapter matches that.' : 'Nothing here yet.'}
          </p>
        )}
      </div>

      {shown.length > visible.length && (
        <div className="stage-mode-more">
          <button type="button" className="ghost" onClick={() => setCardLimit((n) => n + CARD_PAGE)}>
            Show {Math.min(CARD_PAGE, shown.length - visible.length)} more
          </button>
          <span className="stage-count">
            {visible.length} of {shown.length}
          </span>
        </div>
      )}

      {wanted && (
        <section className="op-section stage-mode-stages">
          <div className="stage-section-head">
            <h2>Stages matching</h2>
            <span className="stage-count">
              {stages ? `${stageHits.length} ${stageHits.length === 1 ? 'stage' : 'stages'}` : 'loading the stage index...'}
            </span>
          </div>
          <div className="stage-rows">
            {stageHits.slice(0, STAGE_HITS).map((s) => (
              <Link prefetch={false} key={s.slug} href={`/stages/browse?s=${encodeURIComponent(s.slug)}`} className="stage-row">
                <span className="stage-row-ident">
                  <span className="stage-row-code">
                    {s.code || s.slug}
                    {s.hasBoss && <span className="stage-boss-badge">Boss</span>}
                  </span>
                  <span className="stage-row-name">{s.name}</span>
                  <span className="stage-row-zone">
                    {s.contentLabel ? `${s.contentLabel} -- ` : ''}
                    {s.contentName || s.zoneName || ''}
                  </span>
                </span>
              </Link>
            ))}
            {stages && stageHits.length === 0 && <p className="hint stage-empty">No stage code or name matches that.</p>}
            {stageHits.length > STAGE_HITS && (
              <p className="hint stage-provenance stage-rail-more">
                Showing the first {STAGE_HITS} of {stageHits.length}.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
