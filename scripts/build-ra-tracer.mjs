#!/usr/bin/env node
/**
 * Builds the RA map tracer: a self-contained page for putting the 106 Reclamation
 * Algorithm operations where they actually are on the map.
 *
 *   node scripts/build-ra-tracer.mjs ~/Desktop/ra-map.png
 *   open scripts/ra-tracer.html
 *
 * WHY THIS EXISTS. The map's geometry is in the gamedata but its NODES are not: every
 * one of the main map's 127 nodes carries a single field, minDistance, and no stage
 * carries a zone or a node id (see scripts/build-ra-map.mjs for the full account, and
 * for the check against the CN table). Nothing can join an operation to a place, so
 * the positions have to be read off the live map by someone looking at it. This is the
 * tool for doing that once, and the committed data/ra-nodes.json is the result.
 *
 * WHAT IT DOES.
 *
 *   1. CALIBRATE. A screenshot is a viewport at some zoom, not the map's coordinate
 *      space, so the two have to be tied together before a click means anything. The
 *      page draws the game's own zone polygons over the image; drag and scroll until
 *      they sit on the regions, and that fit IS the transform. It also proves the
 *      geometry: if the polygons can be made to line up, the coordinates are right.
 *
 *   2. TRACE. Pick an operation, click where it sits. It advances to the next unplaced
 *      one, so the common case is click, click, click. Placed nodes can be dragged,
 *      nudged with the arrow keys, or removed.
 *
 *   3. EXPORT. The JSON to save as data/ra-nodes.json. Progress is kept in
 *      localStorage under one key, so a closed tab costs nothing.
 *
 * The image is inlined as a data URI, so the page works from a file:// path with
 * nothing else beside it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-ra-tracer.mjs <map-screenshot>');
  process.exit(2);
}
const image = path.resolve(source.replace(/^~/, process.env.HOME || '~'));
if (!fs.existsSync(image)) {
  console.error(`no such image: ${image}`);
  process.exit(1);
}

const mapFile = path.join(ROOT, 'data', 'ra-map.json');
if (!fs.existsSync(mapFile)) {
  console.error('run scripts/build-ra-map.mjs first -- data/ra-map.json is missing');
  process.exit(1);
}
const mapData = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

// The operations, from the index, in the order the game numbers their level files --
// which is the order the tracer walks, so a run down the list is a run down the map's
// own numbering rather than an alphabet.
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'stages-index.json'), 'utf8'));
const stages = index
  .filter((row) => row.contentId === 'sandbox_1' && !row.variantOf)
  .map((row) => ({ slug: row.slug, name: row.name || row.slug, code: row.code || 'RA-NO' }))
  .sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
if (!stages.length) {
  console.error('no sandbox_1 stages in public/stages-index.json');
  process.exit(1);
}

// Anything already traced, so re-running the generator does not throw the work away.
const nodesFile = path.join(ROOT, 'data', 'ra-nodes.json');
const existing = fs.existsSync(nodesFile) ? JSON.parse(fs.readFileSync(nodesFile, 'utf8')) : { nodes: {} };

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const ext = path.extname(image).toLowerCase();
const dataUri = `data:${mime[ext] || 'image/png'};base64,${fs.readFileSync(image).toString('base64')}`;

const html = `<!doctype html>
<meta charset="utf-8">
<title>RA map tracer</title>
<style>
  :root { color-scheme: dark; --line: #223140; --teal: #4DE8D1; }
  * { box-sizing: border-box; }
  body { margin: 0; display: grid; grid-template-columns: 1fr 320px; height: 100vh;
         background: #0A0E13; color: #E6EDF3; font: 13px/1.4 ui-monospace, monospace; }
  #stage { position: relative; overflow: hidden; cursor: crosshair; }
  #map { position: absolute; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; }
  #overlay { position: absolute; inset: 0; pointer-events: none; }
  aside { border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  h1 { margin: 0; padding: 10px 12px; font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
       color: var(--teal); border-bottom: 1px solid var(--line); }
  .mode { display: flex; gap: 0; border-bottom: 1px solid var(--line); }
  .mode button { flex: 1; padding: 8px; background: none; border: 0; border-bottom: 2px solid transparent;
                 color: #8899A6; font: inherit; cursor: pointer; }
  .mode button.on { color: var(--teal); border-bottom-color: var(--teal); }
  .hint { padding: 8px 12px; color: #8899A6; border-bottom: 1px solid var(--line); }
  #list { flex: 1; overflow-y: auto; min-height: 0; }
  .row { display: flex; gap: 8px; align-items: baseline; padding: 4px 12px; cursor: pointer; }
  .row:hover { background: #151D26; }
  .row.on { background: #16323a; color: var(--teal); }
  .row.done { color: #5B6B78; }
  .row .n { width: 26px; text-align: right; color: #5B6B78; }
  footer { border-top: 1px solid var(--line); padding: 8px 12px; display: grid; gap: 6px; }
  textarea { width: 100%; height: 90px; background: #10161D; color: #E6EDF3; border: 1px solid var(--line);
             font: 11px/1.3 ui-monospace, monospace; }
  button.act { padding: 6px; background: #16323a; color: var(--teal); border: 1px solid var(--teal);
               font: inherit; cursor: pointer; }
  label { display: flex; justify-content: space-between; gap: 8px; color: #8899A6; }
</style>
<div id="stage">
  <img id="map" src="${dataUri}" alt="">
  <svg id="overlay"></svg>
</div>
<aside>
  <h1>RA map tracer</h1>
  <div class="mode">
    <button id="mCal" class="on">1 &middot; calibrate</button>
    <button id="mTrace">2 &middot; trace</button>
  </div>
  <div class="hint" id="hint"></div>
  <div id="list"></div>
  <footer>
    <label>placed <span id="count"></span></label>
    <button class="act" id="copy">Copy JSON for data/ra-nodes.json</button>
    <textarea id="out" readonly></textarea>
  </footer>
</aside>
<script>
const MAP = ${JSON.stringify(mapData)};
const STAGES = ${JSON.stringify(stages)};
const KEY = 'ra-tracer';
const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  view: { x: 0, y: 0, k: 1 },              // the image, in page pixels
  fit: { x: 0, y: 0, k: 0.2 },             // map units -> image pixels
  nodes: ${JSON.stringify(existing.nodes || {})},
};
let mode = 'cal';
let picked = 0;

const el = (id) => document.getElementById(id);
const stage = el('stage'), img = el('map'), svg = el('overlay');
const save = () => localStorage.setItem(KEY, JSON.stringify(saved));

/* Pointer position within the stage. NOT e.offsetX: that is relative to whatever node
   the event hit, which is the <img> for almost every click here -- and the img is
   transformed, so its own box moves as you pan. Every placement would have landed
   somewhere else entirely. */
const at = (e) => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/* map units -> page pixels. Y flips: the game's Y is up, the screen's is down. */
const toPage = (p) => ({
  x: (p.x * saved.fit.k + saved.fit.x) * saved.view.k + saved.view.x,
  y: (-p.y * saved.fit.k + saved.fit.y) * saved.view.k + saved.view.y,
});
/* and back, which is what a click has to do */
const toMap = (px, py) => ({
  x: (((px - saved.view.x) / saved.view.k) - saved.fit.x) / saved.fit.k,
  y: -((((py - saved.view.y) / saved.view.k) - saved.fit.y) / saved.fit.k),
});

function draw() {
  img.style.transform = \`translate(\${saved.view.x}px,\${saved.view.y}px) scale(\${saved.view.k})\`;
  const parts = [];
  for (const z of MAP.zones) {
    const pts = z.vertices.map(toPage).map((p) => \`\${p.x},\${p.y}\`).join(' ');
    parts.push(\`<polygon points="\${pts}" fill="rgb(77 232 209 / .10)" stroke="#4DE8D1" stroke-width="1.5"/>\`);
    const c = toPage(z.center);
    parts.push(\`<text x="\${c.x}" y="\${c.y}" fill="#4DE8D1" font-size="11" text-anchor="middle"
      font-family="ui-monospace, monospace">\${z.name}</text>\`);
  }
  for (const [slug, p] of Object.entries(saved.nodes)) {
    const q = toPage(p);
    const on = STAGES[picked] && STAGES[picked].slug === slug;
    parts.push(\`<circle cx="\${q.x}" cy="\${q.y}" r="\${on ? 7 : 5}" fill="\${on ? '#FFD166' : '#4DE8D1'}"
      stroke="#0A0E13" stroke-width="2"/>\`);
  }
  svg.innerHTML = parts.join('');
  el('count').textContent = \`\${Object.keys(saved.nodes).length} / \${STAGES.length}\`;
  el('out').value = JSON.stringify({ nodes: saved.nodes }, null, 1);
  el('hint').textContent = mode === 'cal'
    ? 'Drag to move the image, scroll to zoom it. Hold SHIFT and scroll to resize the OVERLAY until the outlines sit on the regions. Then switch to trace.'
    : 'Click the map where the highlighted operation sits. It advances on its own. Click a placed dot to remove it, drag it to adjust, arrow keys to nudge.';
}

function list() {
  el('list').innerHTML = STAGES.map((s, i) => {
    const done = saved.nodes[s.slug] ? ' done' : '';
    const on = i === picked ? ' on' : '';
    return \`<div class="row\${done}\${on}" data-i="\${i}"><span class="n">\${i + 1}</span><span>\${s.name}</span></div>\`;
  }).join('');
  const row = el('list').querySelector('.row.on');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

/** The next operation still to place, wrapping round; -1 means all of them are done. */
const advance = () => {
  const after = STAGES.findIndex((s, i) => i > picked && !saved.nodes[s.slug]);
  const any = STAGES.findIndex((s) => !saved.nodes[s.slug]);
  picked = after !== -1 ? after : Math.max(0, any);
};

el('list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  picked = Number(row.dataset.i);
  list(); draw();
});
el('mCal').onclick = () => { mode = 'cal'; el('mCal').classList.add('on'); el('mTrace').classList.remove('on'); draw(); };
el('mTrace').onclick = () => { mode = 'trace'; el('mTrace').classList.add('on'); el('mCal').classList.remove('on'); draw(); };
el('copy').onclick = () => { el('out').select(); document.execCommand('copy'); };

/* Panning and zooming, in both modes: the image in view space, the overlay in fit
   space. SHIFT+wheel scales the overlay, which is the calibration. */
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (mode === 'trace') {
    const here = at(e);
    const hit = Object.entries(saved.nodes).find(([, p]) => {
      const q = toPage(p);
      return Math.hypot(q.x - here.x, q.y - here.y) < 8;
    });
    if (hit) { drag = { kind: 'node', slug: hit[0] }; return; }
    const spot = toMap(here.x, here.y);
    saved.nodes[STAGES[picked].slug] = { x: Math.round(spot.x * 10) / 10, y: Math.round(spot.y * 10) / 10 };
    advance(); save(); list(); draw();
    return;
  }
  drag = { kind: 'pan', x: e.clientX, y: e.clientY, from: { ...saved.view } };
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.kind === 'pan') {
    saved.view.x = drag.from.x + (e.clientX - drag.x);
    saved.view.y = drag.from.y + (e.clientY - drag.y);
  } else {
    const here = at(e);
    saved.nodes[drag.slug] = (({ x, y }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }))(toMap(here.x, here.y));
  }
  draw();
});
stage.addEventListener('pointerup', () => { if (drag) { drag = null; save(); } });
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 1.06 : 1 / 1.06;
  if (e.shiftKey) { saved.fit.k *= step; }
  else {
    // Zoom about the cursor, so the point under it stays under it.
    const here = at(e);
    const bx = (here.x - saved.view.x) / saved.view.k;
    const by = (here.y - saved.view.y) / saved.view.k;
    saved.view.k *= step;
    saved.view.x = here.x - bx * saved.view.k;
    saved.view.y = here.y - by * saved.view.k;
  }
  save(); draw();
}, { passive: false });

/* SHIFT+drag in calibrate mode moves the OVERLAY rather than the image. */
stage.addEventListener('pointerdown', (e) => {
  if (mode !== 'cal' || !e.shiftKey) return;
  drag = { kind: 'fit', x: e.clientX, y: e.clientY, from: { ...saved.fit } };
}, true);
stage.addEventListener('pointermove', (e) => {
  if (!drag || drag.kind !== 'fit') return;
  saved.fit.x = drag.from.x + (e.clientX - drag.x) / saved.view.k;
  saved.fit.y = drag.from.y + (e.clientY - drag.y) / saved.view.k;
  draw();
}, true);

addEventListener('keydown', (e) => {
  const slug = STAGES[picked] && STAGES[picked].slug;
  const at = slug && saved.nodes[slug];
  if (!at) return;
  const step = e.shiftKey ? 20 : 4;
  if (e.key === 'ArrowLeft') at.x -= step;
  else if (e.key === 'ArrowRight') at.x += step;
  else if (e.key === 'ArrowUp') at.y += step;
  else if (e.key === 'ArrowDown') at.y -= step;
  else if (e.key === 'Backspace' || e.key === 'Delete') delete saved.nodes[slug];
  else return;
  e.preventDefault(); save(); list(); draw();
});

// Open on the first operation with no position yet -- which on a fresh start is the
// first one, so the list does not begin by skipping it.
picked = Math.max(0, STAGES.findIndex((s) => !saved.nodes[s.slug]));
img.onload = draw;
list(); draw();
</script>
`;

const out = path.join(ROOT, 'scripts', 'ra-tracer.html');
fs.writeFileSync(out, html);
console.log(`tracer -> ${path.relative(ROOT, out)}`);
console.log(`  ${stages.length} operations to place, ${Object.keys(existing.nodes || {}).length} already traced`);
console.log(`  ${MB(fs.statSync(out).size)} (the screenshot is inlined, so the page stands alone)`);
function MB(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)}MB`; }
