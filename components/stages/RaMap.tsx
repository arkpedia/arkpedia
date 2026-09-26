import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';

/**
 * Reclamation Algorithm as a map, which is what it is.
 *
 * RA is the one mode whose operations are PLACES: a hundred-odd nodes across the Great
 * Desert, all of them filed under the single code RA-NO, which is why the stage list
 * for this content is a wall of identical card fronts. Here they are where they are,
 * drawn the way the game draws them.
 *
 * WHERE THE PIECES COME FROM. The art and the icons are the game's own. The node
 * positions, the paths, the yields and the shape of each marker were surveyed by hand
 * by QingXia-Ela's Reclamation Algorithm Map, because the gamedata gives its 127 nodes
 * no coordinates at all -- credited under the map, and see scripts/imports/import-ra-nodes.mjs
 * for how they were checked against the game's own geometry.
 *
 * THE STYLING IS THEIRS TOO, read off their three.js renderer rather than eyeballed
 * from a screenshot -- their src/three/object/components/node/. Every number in the
 * MARKERS and CHIP blocks below is one of theirs. Coordinates are the game's, Y up,
 * flipped once at the point of use.
 */
export interface RaNode {
  id: number | null;
  x: number;
  y: number;
  type: string;
  size: string | null;
  border: string;
  weather: string | null;
  slug: string | null;
  name: string | null;
  resources: { type: string; count: number }[];
}

/** One map. The overworld is the only one -- see scripts/import-ra-nodes.mjs. */
export interface RaMapEntry {
  id: string;
  name: string;
  art: string;
  /** The art's width in map units, from the map's own backgroundSize. */
  span: number;
  /** Width over height. The overworld's picture is not quite square. */
  aspect: number;
  nodes: RaNode[];
  edges: [number, number][];
}

export interface RaNodeData {
  /** The Reclamation Algorithm season surveyed (sandbox_1). Absent in files written before
   *  it was recorded, which are that season's (lib/stages/raMap.ts). */
  contentId?: string;
  source: { name: string; author: string; repo: string; site: string; what: string };
  maps: RaMapEntry[];
}

/** How far in it goes. 1 is the whole map in the frame. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * The visible span, in map units, that the label sizes below are drawn for: the
 * overworld's 5400 at MAX_ZOOM. Every map scales its labels by its own opening span
 * over this one, so a rift -- which opens showing 2700-odd units rather than 900 --
 * gets labels three times the size in map units and the same size on screen.
 *
 * Per MAP and not per zoom, deliberately. Sized from the live zoom the labels would be
 * screen-fixed again, and a plate that keeps its screen size while the ground moves
 * under it is the drift this was built to stop.
 */
const LABEL_REFERENCE = 5400 / MAX_ZOOM;

/**
 * And they appear from this fraction of a map's opening zoom -- so a map shows them as
 * it opens, and keeps them until you have pulled back a good way. A fraction of the
 * zoom rather than a span in units, because a span has to be compared against
 * frame.w / (fit * zoom) and gets the answer wrong on a wide window.
 */
const LABEL_AT = 0.62;

/**
 * How much of a zoom one unit of wheel delta is worth, as an exponent.
 *
 * The one number to turn if this feels wrong. A 100-unit mouse notch multiplies the
 * zoom by exp(100 * this), so:
 *
 *   0.0006   1.06 a notch, 1.8x over ten -- too slow
 *   0.00085  1.09 a notch, 2.4x over ten
 *   0.0011   1.12 a notch, 3.5x over ten -- too eager, and worse on a trackpad
 */
const ZOOM_PER_DELTA = 0.00085;

/**
 * The labels, in MAP units -- fixed to the desert rather than to the screen.
 *
 * This is how their renderer does it: the label is a mesh in the scene, so it sits at
 * one place beside its node and keeps one size relative to the ground however the camera
 * moves. Sized in screen pixels instead -- which is what this did -- the plate slides in
 * and out from the marker as you zoom, because the marker's own radius is shrinking
 * while the plate is not, and the whole map crawls while you scroll.
 *
 * The numbers are chosen for MAX_ZOOM, where the map is meant to be read: at 6x these
 * land at a 34px plate with a 13px name, and the view opens there.
 */
const LABEL = {
  height: 46,          // 34px at 6x
  gap: 10,
  pad: 14,
  chip: 32,            // the weather square
  kind: 12,            // 9px at 6x
  name: 17,            // 13px at 6x
};

/**
 * Their renderer's units, blown up.
 *
 * Their scene puts a plain node's plate at 2.1 units across; one of their units is 27
 * game units, so it would render 4px wide with the whole map in a 660px frame -- their
 * app is a 3D scene you are always inside, ours is a picture of one. K inflates every
 * measurement below by the same factor, so the PROPORTIONS stay theirs while a small
 * plate lands at a legible 20px.
 */
const K = 68;

/**
 * The three marker shapes, straight out of their core.ts. All lengths are RADII in
 * their units -- getSquareBorder builds a 2.1-wide plate, so its radius is 1.05, and
 * the diamond outline around it is a 4-sided torus of radius 1.7.
 *
 * `border` says which shape a node wears -- square for 117 of the 127, round for the
 * base, the market and the three outposts, hexagon for the four mines -- and `size`
 * scales it: their code shrinks a small round or hexagon to 0.65 and grows a large
 * square to 1.4.
 */
const MARKERS: Record<string, {
  shape: 'rect' | 'circle' | 'hex';
  fill: number; ring: number; ringOpacity: number; ringWidth: number; glyph: number;
  small: number; large: number;
}> = {
  square: { shape: 'rect', fill: 1.05, ring: 1.7, ringOpacity: 0.5, ringWidth: 0.08, glyph: 1.8, small: 1, large: 1.15 },
  round: { shape: 'circle', fill: 1.35, ring: 1.7, ringOpacity: 0.3, ringWidth: 0.14, glyph: 1.6, small: 0.72, large: 1 },
  hexagon: { shape: 'hex', fill: 1.55, ring: 1.8, ringOpacity: 0.5, ringWidth: 0.08, glyph: 1.7, small: 0.72, large: 1 },
};

/**
 * WHERE THIS DEVIATES FROM THEM, and why. Their spread is wider than ours can carry:
 * measured across the shape, their round is 1.5x a plain plate, their hexagon 1.65x and
 * their large square 1.4x, and at 127 markers over one screen the big ones swallowed
 * their neighbours. Their originals, for anyone putting them back:
 *
 *   round    fill 1.6   ring 2.0   glyph 1.8   small 0.65
 *   hexagon  fill 2.0   ring 2.3   glyph 2.0   small 0.65
 *   square   large 1.4
 *   base     fill 4.5   ring 5.5
 *
 * Compressed above to roughly 1.25x, 1.3x and 1.15x, which keeps the game's ranking --
 * a mine still reads bigger than a resource area -- without any one marker dominating.
 */

/**
 * The Headquarters is a landmark rather than a node, and their base/index.ts draws it
 * as its own thing: a circle of radius 4.5 under a ring of 5.5 at 0.8 opacity, with no
 * size scaling. Nearly three times a plain marker, which is what the game does too.
 */
const HQ = { shape: 'circle' as const, fill: 2.2, ring: 2.7, ringOpacity: 0.8, ringWidth: 0.14, glyph: 2.4, small: 1, large: 1 };

/** Their resource chips: a hexagon of three facets, lit like a cube. */
const CHIP = {
  radius: 0.8,          // their hexagon r=2, in a group scaled 0.4
  step: 2.5 * Math.SQRT2 * 0.4 * (Math.sqrt(3) / Math.SQRT2),   // 2.5 * sqrt(3) * 0.4
  glyph: 0.6,           // their icon width 1.5, same 0.4
  top: '#343434',
  right: '#525252',
  left: '#242424',
};

/** Their water tint. Every other resource glyph is #cccccc. */
const RES_TINT: Record<string, string> = { water: '#2a94a7' };

/** Not drawn on the map at all -- their IGNORE_RESOURCES. */
const RES_HIDDEN = new Set(['gold', 'goodsundry']);

/** The market's own colours, from their market/index.ts: teal, with a white glyph. */
const MARKET = { fill: '#0c9886', glyph: '#ffffff' };

/**
 * What each kind of node is called, in the game's own words -- the top line of the
 * label, as the game prints it (Hunting Area over the node's name).
 */
const KINDS: Record<string, string> = {
  collect: 'Resource Area',
  hunt: 'Hunting Area',
  mine: 'Mine',
  nest: 'Nest',
  cave: 'Cave',
  battle: 'Conflict Area',
  base: 'Headquarters',
  outpost: 'Outpost',
  gate: 'Pass',
  market: 'Backroom',
  encounter: 'Encounter',
  expedition: 'Expedition',
  racing: 'Race',
  selection: 'Choice',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A regular polygon's points, pointy-top, in SVG coordinates. */
function polygon(r: number, sides: number) {
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push(`${(r * Math.cos(angle)).toFixed(2)},${(r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

/**
 * Where a map opens, for a frame of this shape.
 *
 * The overworld opens all the way in on the Headquarters, where the game opens: the
 * whole desert at once is 127 markers and no labels, a picture of a map rather than a
 * map. A rift has four to sixteen nodes in a corner of a much larger texture, so it
 * opens at whatever zoom puts its own NODES in the frame -- fitting the art there shows
 * a lot of empty ground and four specks.
 *
 * The FRAME has to come into it. Sizing this from the art box alone was wrong on any
 * window wider than it is tall: the visible width is frame.w / (fit * zoom), which on a
 * wide frame is far more than the art's own span, so a rift opened with its nodes in a
 * quarter of the width and its labels looking enormous beside them.
 */
function opening(map: RaMapEntry, frame: { w: number; h: number }) {
  const art = { w: map.span, h: map.span / map.aspect };
  const fit = Math.min(frame.w / art.w, frame.h / art.h);
  const hq = map.nodes.find((n) => n.type === 'base');
  if (map.id === 'main' && hq) return { zoom: MAX_ZOOM, centre: { x: hq.x, y: hq.y }, fit };
  const xs = map.nodes.map((n) => n.x);
  const ys = map.nodes.map((n) => n.y);
  if (!xs.length) return { zoom: MIN_ZOOM, centre: { x: 0, y: 0 }, fit };
  const box = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    // A floor on the span, so a map of four nodes in a line does not zoom to the
    // maximum and lose its own background.
    w: Math.max(Math.max(...xs) - Math.min(...xs), 900),
    h: Math.max(Math.max(...ys) - Math.min(...ys), 900),
  };
  // The zoom at which the node box, with room around it, fills the frame.
  const zoom = clamp(
    Math.min(frame.w / (fit * box.w * 1.3), frame.h / (fit * box.h * 1.3)),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return { zoom, centre: { x: box.x, y: box.y }, fit };
}

/** The list tab's own id, which no map can have. */
const LIST = '__list';

export default function RaMap({
  nodes: data,
  listLabel,
  list,
}: {
  nodes: RaNodeData;
  /** The tab beside the map, holding everything the map has no node for. */
  listLabel?: string;
  list?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  /** SVG <image> hrefs get no rewriting of their own. A bare path 307s to the asset
   *  commit of the last deploy, not the content release the page was rendered from. */
  const contentUrl = useContentUrl();
  /** Which tab: a map id, or LIST for the operations no map places. */
  const [tab, setTab] = useState<string>(data.maps[0]?.id);
  // Falls back to the first map on the list tab, so every measurement below keeps a
  // real map to work from rather than going undefined for a tab that has no geometry.
  const map = useMemo(
    () => data.maps.find((m) => m.id === tab) ?? data.maps[0],
    [data.maps, tab],
  );
  const showing = tab !== LIST;
  /** The art's box in map units -- what "fit" means, and what the view is clamped to. */
  const ART = useMemo(() => ({ width: map.span, height: map.span / map.aspect }), [map]);
  const [frame, setFrame] = useState({ w: 1000, h: 620 });
  const [zoom, setZoom] = useState(() => opening(data.maps[0], { w: 1000, h: 620 }).zoom);
  /** Where the frame is looking, in map units. */
  const [centre, setCentre] = useState(() => opening(data.maps[0], { w: 1000, h: 620 }).centre);

  /**
   * How much bigger this map's labels are than the overworld's, and the span at which
   * they come up. Both come from where the map OPENS, so they are constants per map --
   * a rift showing 2739 units gets labels 3x the size in units, which is the same size
   * on screen as the overworld's at 6x.
   */
  const label = useMemo(() => {
    const open = opening(map, frame);
    const main = data.maps[0];
    // Pixels per map unit at this map's opening view, against the overworld's at its
    // own -- which is what the LABEL measurements below were drawn for. Both are
    // measured against the same frame, so the frame cancels and the ratio is real.
    const mine = open.fit * open.zoom;
    const reference = Math.min(frame.w / main.span, frame.h / (main.span / main.aspect)) * MAX_ZOOM;
    return { scale: reference / mine, from: open.zoom * LABEL_AT };
  }, [map, frame, data.maps]);

  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: number } | null>(null);
  const swallow = useRef(false);

  /**
   * The authoritative view, in a ref, with React state as its mirror.
   *
   * Not just a convenience for the native wheel listener: a trackpad fires a burst of
   * wheel events inside ONE frame, and React has not re-rendered between them, so every
   * event in the burst would read the same pre-burst zoom, compute the same next value,
   * and set it -- six notches of scrolling worth one. Each event has to build on the
   * last, which means the last has to be readable now rather than after a render.
   */
  const live = useRef({ zoom, centre, frame });
  const apply = useCallback((next: { zoom: number; centre: { x: number; y: number } }) => {
    live.current = { ...live.current, ...next };
    setZoom(next.zoom);
    setCentre(next.centre);
  }, []);

  const byId = useMemo(() => {
    const out = new Map<number, RaNode>();
    for (const node of map.nodes) if (node.id != null) out.set(node.id, node);
    return out;
  }, [map.nodes]);

  // The frame's own size decides the visible span, so it has to be measured.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A frame of zero is not a frame: a hidden tab, a display:none ancestor or a
    // not-yet-laid-out first paint all report 0, and 0 would divide its way into a NaN
    // viewBox and blank the map. Keep the last real measurement instead.
    const measure = () => {
      const w = el.clientWidth; const h = el.clientHeight;
      if (w > 0 && h > 0) setFrame({ w, h });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Open the chosen map, once for each map and once the frame's real size is in.
   *
   * Not on every frame change: a window resize mid-read would throw the reader back to
   * the Headquarters. `applied` is what makes it once-per-map rather than a fight with
   * whatever the reader has zoomed to.
   */
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const key = `${map.id}@${frame.w}x${frame.h}`;
    if (applied.current === map.id || frame.w <= 0) return;
    applied.current = map.id;
    apply(opening(map, frame));
    void key;
  }, [map, frame, apply]);

  /**
   * The window on the map, in map units.
   *
   * At zoom 1 the whole art is CONTAINED in the frame, whatever shape the frame is, so
   * there is nothing to scroll to and nothing cropped. Past that, the view is clamped to
   * the art's edges: the desert can be examined but not dragged off into empty space.
   */
  const view = useMemo(() => {
    const fit = Math.min(frame.w / ART.width, frame.h / ART.height);
    const scale = fit * zoom;                       // pixels per map unit
    const w = frame.w / scale;
    const h = frame.h / scale;
    const limX = Math.max(0, (ART.width - w) / 2);
    const limY = Math.max(0, (ART.height - h) / 2);
    return { scale, w, h, x: clamp(centre.x, -limX, limX), y: clamp(centre.y, -limY, limY) };
  }, [frame, zoom, centre, ART]);

  // The frame is measured, not driven, so it is mirrored in rather than out.
  live.current.frame = frame;

  /** Zoom about a point in the frame, in frame pixels, keeping that point still. */
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    const { zoom: z, centre: c, frame: f } = live.current;
    const fit = Math.min(f.w / ART.width, f.h / ART.height);
    const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === z) return;
    const before = fit * z;
    const after = fit * next;
    const mx = c.x + (px - f.w / 2) / before;
    const my = c.y - (py - f.h / 2) / before;
    apply({ zoom: next, centre: { x: mx - (px - f.w / 2) / after, y: my + (py - f.h / 2) / after } });
  }, [apply, ART]);

  /**
   * ctrl/cmd + wheel zooms; a plain wheel scrolls the page, because this is a page on a
   * website and that is what a wheel means everywhere else on it. Same bargain the base
   * planner strikes.
   *
   * A NATIVE listener, because React's onWheel is registered passive and a
   * preventDefault() inside it is ignored -- so the page would scroll under the zoom.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Proportional to how far the wheel actually turned rather than a fixed notch: a
      // mouse notch is one event but a trackpad sends a burst of small ones, so a flat
      // step threw the trackpad several times as far. Clamped because a fast flick
      // reports thousands, and deltaMode 1 (lines) reports single digits.
      const steps = clamp(Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : 1), 1, 200);
      zoomAt(Math.exp((e.deltaY < 0 ? 1 : -1) * steps * ZOOM_PER_DELTA), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /** Their units, in map units, at this zoom. Markers shrink by the square root of
   *  the zoom: constant in map units they grow into three enormous plates, constant on
   *  screen and the chips never become readable. */
  const theirs = (n: number) => (n * K) / Math.sqrt(zoom);

  /**
   * Where each label goes, so they stop sitting on top of one another.
   *
   * Every label is a fixed size in map units and every node is at a fixed place, so the
   * whole arrangement can be solved ONCE per map and then just drawn -- it does not
   * depend on the zoom or the pan at all.
   *
   * Greedy, in a stable order: each label takes the first of six placements -- right,
   * left, then the same two lifted and dropped by its own height -- that does not
   * overlap a label already placed. Where all six collide it takes the right-hand one
   * and overlaps, which on the Annihilation rift is a handful of the sixteen rather
   * than most of them.
   *
   * A proper force-directed pass would do better and would also mean labels that
   * shuffle every time the set changes; this is deterministic, which matters more when
   * the same map has to look the same twice.
   */
  const placed = useMemo(() => {
    const L = Object.fromEntries(
      Object.entries(LABEL).map(([k, v]) => [k, v * label.scale]),
    ) as typeof LABEL;
    /**
     * Everything a label must not land on. Seeded with the MARKERS and their resource
     * chips before any label is placed, because that is what the labels were actually
     * covering: label-on-label was rare, label-on-a-neighbour's-plate was most of it.
     * Measured at the zoom the map opens at, since that is where labels are shown and
     * markers are at their smallest there.
     */
    const open = opening(map, frame).zoom;
    const taken: { x: number; y: number; w: number; h: number }[] = map.nodes.map((n) => {
      const sh = n.type === 'base' ? HQ : (MARKERS[n.border] || MARKERS.square);
      const sc = n.size === 'small' ? sh.small : sh.large;
      const r = (sh.fill * sc * K) / Math.sqrt(open);
      const chip = (CHIP.radius * K) / Math.sqrt(open);
      const chips = n.resources.filter((x) => !RES_HIDDEN.has(x.type)).length;
      // The chips hang below the plate, so the obstacle is taller than it is wide.
      return { x: n.x - r, y: -n.y - r, w: r * 2, h: r * 2 + (chips ? chip * 2.4 : 0) };
    });
    type Box = { x: number; y: number; w: number; h: number };
    const hits = (r: Box, except?: Box) => taken.some((t) => t !== except && (
      r.x < t.x + t.w && t.x < r.x + r.w && r.y < t.y + t.h && t.y < r.y + r.h
    ));
    const out = new Map<number, { x: number; y: number }>();
    // Left to right, top to bottom: an order that does not depend on the data's own.
    const order = map.nodes
      .map((node, i) => ({ node, i }))
      .sort((a, b) => a.node.x - b.node.x || b.node.y - a.node.y);
    for (const { node, i } of order) {
      const kind = KINDS[node.type] || node.type;
      const shape = node.type === 'base' ? HQ : (MARKERS[node.border] || MARKERS.square);
      const scale = node.size === 'small' ? shape.small : shape.large;
      const gap = ((shape.fill * scale * K) / Math.sqrt(MAX_ZOOM)) + L.gap;
      const w = L.chip + L.pad * 2 + Math.max(
        (node.name || kind).length * L.name * 0.56,
        kind.length * L.kind * 0.6,
      );
      const h = L.height;
      const spots = [
        { x: gap, y: -h / 2 },
        { x: -gap - w, y: -h / 2 },
        { x: gap, y: -h * 1.5 },
        { x: -gap - w, y: -h * 1.5 },
        { x: gap, y: h * 0.5 },
        { x: -gap - w, y: h * 0.5 },
        { x: gap, y: -h * 2.5 },
        { x: -gap - w, y: -h * 2.5 },
        { x: gap, y: h * 1.5 },
        { x: -gap - w, y: h * 1.5 },
        // Last resorts: centred over the node, above and below, where a crowded middle
        // has nowhere sideways to go.
        { x: -w / 2, y: -h * 2.2 },
        { x: -w / 2, y: h * 1.2 },
      ];
      // Its OWN marker is not an obstacle to its own label: they belong together, and
      // the gap already clears the plate.
      const mine = taken[i];
      const spot = spots.find((c) => !hits({ x: node.x + c.x, y: -node.y + c.y, w, h }, mine)) ?? spots[0];
      taken.push({ x: node.x + spot.x, y: -node.y + spot.y, w, h });
      out.set(i, spot);
    }
    return out;
  }, [map, label.scale, frame]);

  // The hovered node is drawn last so its label sits over its neighbours rather than
  // under them.
  const order = useMemo(() => {
    if (hover == null) return map.nodes;
    const rest = map.nodes.filter((_, i) => i !== hover);
    return [...rest, map.nodes[hover]];
  }, [map.nodes, hover]);

  return (
    <section className="ra-map">
      <div className="ra-map-head">
        {/* The map, and beside it everything the map has no node for. Tabs rather than
            one under the other: the list is 18 operations of 102 and reads as a
            footnote to the map, not as a second thing to scroll past. */}
        <div className="ra-map-pick" role="group" aria-label="View">
          {data.maps.map((m) => (
            <button
              key={m.id}
              type="button"
              className="filter-chip ra-map-tab"
              aria-pressed={m.id === tab}
              onClick={() => {
                setTab(m.id);
                setHover(null);
                apply(opening(m, frame));
              }}
            >
              {m.name}
            </button>
          ))}
          {list && (
            <button
              type="button"
              className="filter-chip ra-map-tab"
              aria-pressed={tab === LIST}
              onClick={() => { setTab(LIST); setHover(null); }}
            >
              {listLabel || 'Other operations'}
            </button>
          )}
        </div>
        {/* Nothing to zoom on the list. */}
        <div className="ra-map-zoom" hidden={!showing}>
          <span className="ra-zoom-hint">{'⌘'}/ctrl + scroll to zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            aria-label="Zoom"
            onChange={(e) => zoomAt(Number(e.target.value) / live.current.zoom, frame.w / 2, frame.h / 2)}
          />
          <button
            type="button"
            className="ghost ra-zoom-reset"
            onClick={() => apply({ zoom: MIN_ZOOM, centre: { x: 0, y: 0 } })}
            disabled={zoom === MIN_ZOOM}
          >
            Fit
          </button>
          <button
            type="button"
            className="ghost ra-zoom-reset"
            onClick={() => apply(opening(map, frame))}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Hidden on the other tab, not unmounted. The frame's size is what the label
          pass and the opening zoom are computed from; display:none makes the
          ResizeObserver report 0x0, which the measure above ignores, so the last real
          size survives the round trip and coming back does not re-open the view. */}
      <div
        className={`ra-map-frame${zoom > MIN_ZOOM ? ' zoomed' : ''}${showing ? '' : ' put-away'}`}
        ref={box}
        /* Drag to pan, but only once it IS a drag: every node is a link, so a press
           that moves four pixels has to stay a click. Same threshold, and the same
           swallow-the-click-afterwards trick, as the Terminal's rails. */
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          swallow.current = false;
          drag.current = { x: e.clientX, y: e.clientY, from: { ...centre }, moved: 0 };
        }}
        onPointerMove={(e) => {
          const from = drag.current;
          if (!from) return;
          const dx = e.clientX - from.x;
          const dy = e.clientY - from.y;
          from.moved = Math.max(from.moved, Math.hypot(dx, dy));
          if (from.moved <= 4) return;
          // Capture keeps a drag alive past the frame's edge, and it THROWS on a pointer
          // id it cannot capture -- which took the pan down with it.
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pan anyway */ }
          apply({
            zoom: live.current.zoom,
            centre: { x: from.from.x - dx / view.scale, y: from.from.y + dy / view.scale },
          });
        }}
        onPointerUp={(e) => {
          const from = drag.current;
          drag.current = null;
          // State first, release second: releasePointerCapture throws the same way, and
          // a throw before this line would leave the click armed and navigate.
          if (from && from.moved > 4) swallow.current = true;
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
        }}
        onPointerCancel={() => { drag.current = null; swallow.current = false; }}
        onClickCapture={(e) => {
          if (!swallow.current) return;
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <svg
          viewBox={`${view.x - view.w / 2} ${-view.y - view.h / 2} ${view.w} ${view.h}`}
          className="ra-map-svg"
          role="img"
          aria-label="Map of the Great Desert"
        >
          <image
            href={contentUrl(map.art)}
            x={-ART.width / 2}
            y={-ART.height / 2}
            width={ART.width}
            height={ART.height}
          />

          {/* The paths first, so the nodes sit on top of their own joins. */}
          <g className="ra-paths" strokeWidth={theirs(0.05)}>
            {map.edges.map(([a, b]) => {
              const from = byId.get(a); const to = byId.get(b);
              if (!from || !to) return null;
              return <line key={`${a}-${b}`} x1={from.x} y1={-from.y} x2={to.x} y2={-to.y} />;
            })}
          </g>

          {order.map((node) => {
            const i = map.nodes.indexOf(node);
            const shape = node.type === 'base' ? HQ : (MARKERS[node.border] || MARKERS.square);
            const scale = node.size === 'small' ? shape.small : shape.large;
            const fill = theirs(shape.fill * scale);
            const ring = theirs(shape.ring * scale);
            const glyph = theirs(shape.glyph * scale);
            const market = node.type === 'market';
            const kind = KINDS[node.type] || node.type;
            const chips = node.resources.filter((r) => !RES_HIDDEN.has(r.type)).slice(0, 3);
            const showLabel = zoom >= label.from;
            // Every label measurement, at this map's own scale.
            const L = Object.fromEntries(
              Object.entries(LABEL).map(([k, v]) => [k, v * label.scale]),
            ) as typeof LABEL;
            const spot = placed.get(i) ?? { x: 0, y: 0 };
            /**
             * The plate has to fit its own text. A fixed width held "Headquarters" and
             * cut "Mountainous Interception Point" in half, and SVG cannot measure a
             * string without laying it out first -- so this estimates from the character
             * count: the name near 0.56em a character, the kind in mono a wider 0.6em.
             * A few units out either way disappears into the padding.
             */
            const tagWidth = L.chip + L.pad * 2 + Math.max(
              (node.name || kind).length * L.name * 0.56,
              kind.length * L.kind * 0.6,
            );

            return (
              <g key={`${node.id ?? 'n'}-${i}`} transform={`translate(${node.x} ${-node.y})`}>
                {/* Their ring: outside the fill, translucent. A square's ring is a
                    DIAMOND -- a four-sided torus turned 45 degrees -- which is the
                    detail that makes their plain plates read as the game's. */}
                {shape.shape === 'circle'
                  ? <circle className="ra-ring" r={ring} opacity={shape.ringOpacity} strokeWidth={theirs(shape.ringWidth * scale)} />
                  : (
                    <polygon
                      className="ra-ring"
                      points={polygon(ring, shape.shape === 'rect' ? 4 : 6)}
                      opacity={shape.ringOpacity}
                      strokeWidth={theirs(shape.ringWidth * scale)}
                    />
                  )}

                <Link prefetch={false}
                  href={node.slug ? `/stages/browse?s=${encodeURIComponent(node.slug)}` : '#'}
                  className="ra-node-link"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                  aria-label={`${node.name || kind}, ${kind}`}
                >
                  {shape.shape === 'circle' && (
                    <circle className="ra-fill" r={fill} style={market ? { fill: MARKET.fill } : undefined} />
                  )}
                  {/* Axis-aligned, unlike its ring: their fill is a plain plate. The
                      corner is ours -- a hair of rounding, because the game's plates
                      have one and a hard 90 degrees reads as a bug beside them. */}
                  {shape.shape === 'rect' && (
                    <rect
                      className="ra-fill"
                      x={-fill}
                      y={-fill}
                      width={fill * 2}
                      height={fill * 2}
                      rx={fill * 0.22}
                      style={market ? { fill: MARKET.fill } : undefined}
                    />
                  )}
                  {shape.shape === 'hex' && (
                    <polygon className="ra-fill" points={polygon(fill, 6)} style={market ? { fill: MARKET.fill } : undefined} />
                  )}
                  {/* The glyphs arrive WHITE on alpha and their renderer draws them
                      black, so every one is inverted -- except the market's, which it
                      keeps white on the teal. */}
                  <image
                    className={`ra-glyph${market ? '' : ' ink'}`}
                    href={contentUrl(`/ra-map/node/${node.type}.webp`)}
                    x={-glyph / 2}
                    y={-glyph / 2}
                    width={glyph}
                    height={glyph}
                  />
                  <title>{`${node.name || kind} -- ${kind}`}</title>
                </Link>

                {/* What it yields: their three-facet hexagons, lit like little cubes. */}
                {chips.length > 0 && (
                  <g transform={`translate(${-((chips.length - 1) / 2) * theirs(CHIP.step)} ${fill + theirs(CHIP.radius) * 1.15})`}>
                    {chips.map((res, at) => {
                      const r = theirs(CHIP.radius);
                      const h = (Math.sqrt(3) / 2) * r;
                      return (
                        <g key={res.type} transform={`translate(${at * theirs(CHIP.step)} 0)`}>
                          <polygon className="ra-chip-facet" points={`0,0 ${h},${-r / 2} 0,${-r} ${-h},${-r / 2}`} fill={CHIP.top} />
                          <polygon className="ra-chip-facet" points={`0,0 ${h},${-r / 2} ${h},${r / 2} 0,${r}`} fill={CHIP.right} />
                          <polygon className="ra-chip-facet" points={`0,0 ${-h},${-r / 2} ${-h},${r / 2} 0,${r}`} fill={CHIP.left} />
                          <polygon className="ra-ring" points={polygon(r * 1.08, 6)} opacity={0.5} strokeWidth={theirs(0.14 * 0.4)} />
                          <image
                            className="ra-glyph"
                            href={contentUrl(`/ra-map/res/${res.type}.webp`)}
                            x={-theirs(CHIP.glyph) / 2}
                            y={-theirs(CHIP.glyph) / 2}
                            width={theirs(CHIP.glyph)}
                            height={theirs(CHIP.glyph)}
                            style={{ color: RES_TINT[res.type] || '#cccccc' }}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* The game's label: the kind over the name on a dark plate, with the
                    weather chip beside it. Every measurement is in MAP units and the
                    side is always the same, so the plate is pinned to its node -- it
                    does not slide, resize or hop across as the map zooms. */}
                {showLabel && (
                  /* Placed by the pass above, in map units: a fixed spot beside its own
                     node that does not move, resize or hop as the map zooms. The gap is
                     measured off the marker at MAX_ZOOM, where it is smallest, so the
                     plate clears it without touching. */
                  <g className="ra-tag" transform={`translate(${spot.x} ${spot.y})`}>
                    <rect className="ra-tag-plate" x={0} y={0} width={tagWidth} height={L.height} rx={5} />
                    <rect
                      className="ra-tag-chip"
                      x={6}
                      y={(L.height - L.chip) / 2}
                      width={L.chip}
                      height={L.chip}
                      rx={5}
                    />
                    <image
                      className="ra-glyph"
                      href={contentUrl('/ra-map/weather-normal.webp')}
                      x={6 + L.chip * 0.22}
                      y={(L.height - L.chip * 0.56) / 2}
                      width={L.chip * 0.56}
                      height={L.chip * 0.56}
                      opacity={0.7}
                    />
                    <text className="ra-tag-kind" x={L.chip + L.pad} y={L.height * 0.42} fontSize={L.kind}>
                      {kind}
                    </text>
                    <text className="ra-tag-name" x={L.chip + L.pad} y={L.height * 0.82} fontSize={L.name}>
                      {node.name || kind}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Rendered whichever tab is open, and hidden with the attribute rather than
          mounted on demand: it is in the static HTML that way, and its cards are lazy
          images, so a tab nobody opens costs markup and no requests. */}
      {list && <div className="ra-map-list" hidden={showing}>{list}</div>}

      <p className="hint ra-map-credit" hidden={!showing}>
        Node positions, paths, yields and marker styling from{' '}
        <a href={data.source.site} target="_blank" rel="noreferrer noopener">{data.source.name}</a>{' '}
        by {data.source.author} (<a href={data.source.repo} target="_blank" rel="noreferrer noopener">source</a>),
        used with thanks.
      </p>
    </section>
  );
}
