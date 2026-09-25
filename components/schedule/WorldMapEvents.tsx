import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
// world-atlas ships raw JSON (public-domain Natural Earth data, 110m
// resolution) -- bundled at build time, no runtime fetch needed.
import worldTopo from 'world-atlas/land-110m.json';
import { CommunityEvent } from '@/lib/schedule/eventTypes';
import { project, getEventStatus, formatCountdown, MAP_WIDTH, MAP_HEIGHT } from '@/lib/maps/mapProjection';

function geometryToPath(geometry: Geometry): string {
  const ringToPoints = (ring: number[][]) =>
    ring.map(([lng, lat]) => {
      const { x, y } = project(lat, lng);
      return `${x},${y}`;
    });

  const polygonToPath = (rings: number[][][]) =>
    rings.map((ring) => `M${ringToPoints(ring).join('L')}Z`).join(' ');

  if (geometry.type === 'Polygon') {
    return polygonToPath(geometry.coordinates as number[][][]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).map(polygonToPath).join(' ');
  }
  return '';
}

function shortStatusLabel(status: 'upcoming' | 'live' | 'ended', startTime: string, now: number): string {
  if (status === 'live') return 'LIVE';
  if (status === 'ended') return 'Ended';
  return formatCountdown(startTime, now);
}

/** `now` is the page's own clock: the pins' status labels render from it on the server and
 *  in the browser's first render, which must match, and from the reader's clock once
 *  mounted (EventListPanel does the same). */
export default function WorldMapEvents({ events, now: renderedAt }: { events: CommunityEvent[]; now: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [now, setNow] = useState(renderedAt);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  /**
   * The pin whose tooltip has been CLICKED open, as against merely hovered.
   *
   * Hover alone cannot carry this map: Singapore and Malaysia project 8px apart
   * at the map's own width, so their touch discs overlap outright, and the
   * pointer travelling from a pin to its tooltip crosses a neighbour whose
   * hover handler swapped the tooltip out mid-journey -- you set off for one
   * event's link and arrived at another's. A click pins the tooltip and only a
   * deliberate act dismisses it: the same pin again, a click off the map, or
   * Escape. Hover still previews while nothing is pinned.
   */
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  /**
   * User units per rendered CSS pixel.
   *
   * The map is a 1000x500 viewBox stretched to whatever width it is given, so
   * everything drawn inside it shrinks with the container -- on a 390px phone
   * the whole thing renders at 0.34, which took the pins to 8x10 CSS px (below
   * any usable touch target) and the timer labels to about 3px tall. The pin
   * furniture is counter-scaled by this so it keeps a constant SCREEN size
   * while its POSITION still tracks the coastline underneath it.
   */
  const [pinScale, setPinScale] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const w = svg.getBoundingClientRect().width;
      if (w > 0) setPinScale(MAP_WIDTH / w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // Escape closes fullscreen, matching standard fullscreen UX elsewhere.
  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  /* The two ways out of a pinned tooltip that are not the pin itself. The
     click listener is on the document because the tooltip is portaled to the
     body -- it is not inside this component's tree to bubble through. */
  useEffect(() => {
    if (pinnedIndex === null) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPinnedIndex(null); setActiveIndex(null); }
    }
    function onClickAway(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.map-tooltip-portal') || t?.closest('.map-pin')) return;
      setPinnedIndex(null);
      setActiveIndex(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClickAway);
    };
  }, [pinnedIndex]);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const landPath = useMemo(() => {
    const topology = worldTopo as unknown as Topology;
    const landObject = topology.objects.land as GeometryCollection;
    const geo = feature(topology, landObject) as unknown as FeatureCollection;
    return geo.features.map((f) => geometryToPath(f.geometry)).join(' ');
  }, []);

  const withStatus = useMemo(
    () =>
      events.map((ev) => ({
        ...ev,
        status: getEventStatus(ev.startTime, ev.endTime, now),
      })),
    [events, now]
  );

  /**
   * Which pins get to show their timer label.
   *
   * There was no collision handling at all, so pins that sit close together --
   * four of ours are inside a few pixels of each other in SE Asia -- printed
   * their labels on top of one another and two "LIVE"s rendered as a smeared
   * "LIVEE". Greedy and deterministic: walk the pins in order, keep a label
   * only when its box misses every box already kept. A pin that loses its
   * label still shows its dot and still opens its tooltip, so nothing is lost
   * but the duplicate ink. Measured in USER units, and label boxes grow as the
   * map shrinks (see pinScale), so a crowded phone drops more of them.
   */
  const labelled = useMemo(() => {
    // Generous on purpose: the estimate only has to be an upper bound on the
    // real text box, and a label wrongly kept is a collision the reader sees
    // while a label wrongly dropped is one dot without a caption.
    const CHAR_W = 7;
    const PAD = 4;
    /* Seeded with every pin's own dot, so a label is dropped not only when it
       would hit another label but when it would sit on top of another pin --
       the SE Asia cluster stacks four pins within a few user units and the
       captions were landing on the dots below them. */
    const kept = withStatus.map((ev) => {
      const { x, y } = project(ev.lat, ev.lng);
      const r = 6 * pinScale;
      return { x1: x - r, y1: y - r, x2: x + r, y2: y + r };
    });
    const allow = new Set<number>();
    withStatus.forEach((ev, i) => {
      const text = shortStatusLabel(ev.status, ev.startTime, now);
      const { x, y } = project(ev.lat, ev.lng);
      const w = (text.length * CHAR_W + PAD * 2) * pinScale;
      const h = 14 * pinScale;
      const box = { x1: x - w / 2, y1: y - 13 * pinScale - h, x2: x + w / 2, y2: y - 13 * pinScale };
      const clash = kept.some((k) => box.x1 < k.x2 && box.x2 > k.x1 && box.y1 < k.y2 && box.y2 > k.y1);
      if (!clash) {
        kept.push(box);
        allow.add(i);
      }
    });
    return allow;
  }, [withStatus, now, pinScale]);

  // Converts a pin's SVG-space (x, y) -- in viewBox units -- to real
  // screen pixel coordinates, so the tooltip (a normal HTML element
  // portaled to document.body) can sit exactly above wherever the pin
  // actually renders, at whatever size the SVG is currently scaled to.
  /**
   * The tooltip carries a link, and the pointer has to cross open map to reach
   * it -- closing the moment it left the pin made that link unclickable. The
   * close is deferred instead, and cancelled if the pointer arrives at the
   * tooltip; the tooltip's own leave restarts it.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const closeSoon = () => {
    if (pinnedIndex !== null) return; // pinned open; hover does not get to close it
    cancelClose();
    closeTimer.current = setTimeout(() => setActiveIndex(null), 220);
  };
  const dismiss = () => {
    cancelClose();
    setPinnedIndex(null);
    setActiveIndex(null);
  };
  useEffect(() => cancelClose, []);

  function showTooltipFor(index: number, svgX: number, svgY: number) {
    cancelClose();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / MAP_WIDTH;
    const scaleY = rect.height / MAP_HEIGHT;
    setTooltipPos({
      x: rect.left + svgX * scaleX,
      y: rect.top + svgY * scaleY,
    });
    setActiveIndex(index);
  }

  if (events.length === 0) {
    return (
      <div className="waiting-box">
        <h2>No events scheduled</h2>
        <p className="hint">
          Add events in <code>lib/eventsConfig.ts</code> to have them show up here.
        </p>
      </div>
    );
  }


  const activeEvent = activeIndex !== null ? withStatus[activeIndex] : null;

  return (
    <div className={`world-map-wrap${isFullscreen ? ' fullscreen' : ''}`}>
      <button
        type="button"
        className="world-map-fullscreen-btn"
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
      >
        {isFullscreen ? '✕' : '⛶'}
      </button>
      <svg ref={svgRef} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="world-map-svg">
        <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} className="world-map-bg" />
        <path d={landPath} className="world-map-land" />
        <line x1={0} y1={MAP_HEIGHT / 2} x2={MAP_WIDTH} y2={MAP_HEIGHT / 2} className="world-map-equator" />

        {withStatus.map((ev, i) => {
          const { x, y } = project(ev.lat, ev.lng);
          return (
            <g
              key={i}
              transform={`translate(${x}, ${y})`}
              className={`map-pin map-pin-${ev.status}`}
              onMouseEnter={() => { if (pinnedIndex === null) showTooltipFor(i, x, y); }}
              onMouseLeave={closeSoon}
              onClick={(e) => {
                e.stopPropagation();
                if (pinnedIndex === i) { dismiss(); return; }
                setPinnedIndex(i);
                showTooltipFor(i, x, y);
              }}
            >
              {/* Counter-scaled: the group's translate keeps the pin over its
                  city, and this keeps the pin itself the same size on screen
                  no matter how small the map has been drawn. */}
              <g transform={`scale(${pinScale})`}>
                {labelled.has(i) && (
                  <text
                    x={0}
                    y={-13}
                    textAnchor="middle"
                    className={`map-pin-timer map-pin-timer-${ev.status}`}
                  >
                    {shortStatusLabel(ev.status, ev.startTime, now)}
                  </text>
                )}
                {ev.status === 'live' && <circle r={9} className="map-pin-pulse" />}
                <circle r={4.5} className="map-pin-dot" />
                {/* An invisible disc that carries the touch target up to ~26 CSS
                    px without making the visible dot any bigger. */}
                <circle r={13} fill="transparent" />
              </g>
            </g>
          );
        })}
      </svg>

      {activeEvent &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="map-tooltip-portal"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
            onMouseEnter={cancelClose}
            onMouseLeave={closeSoon}
          >
            <div className="map-tooltip">
              <div className="map-tooltip-header">
                {activeEvent.status === 'live' && <span className="badge badge-tradeable">LIVE NOW</span>}
                {activeEvent.status === 'upcoming' && (
                  <span className="badge">Starts in {formatCountdown(activeEvent.startTime, now)}</span>
                )}
                {activeEvent.status === 'ended' && <span className="badge badge-no-trade">Ended</span>}
              </div>
              <div className="map-tooltip-name">{activeEvent.name}</div>
              <div className="hint">{activeEvent.country}</div>
              <a href={activeEvent.url} target="_blank" rel="noreferrer" className="map-tooltip-link">
                View event →
              </a>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}