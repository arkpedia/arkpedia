#!/usr/bin/env node
// Local-only review server; never a publication or reader fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(process.argv[2] ?? '../arkpedia-l2d-assets/event-transitions/players');
const port = Number(process.argv[3] ?? 3212);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Expected a local port from 1024 to 65535');
const entry = fileURLToPath(new URL('./event-entrance-review.ts', import.meta.url));
const bundle = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', write: false });
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Native event entrance review</title>
<style>body{margin:0;background:#111;color:white;font:16px system-ui}nav{padding:12px;display:flex;gap:12px;align-items:center}canvas{display:block;width:1280px;height:720px}input{width:240px}</style>
<nav><label>Pack <select aria-label="Pack"></select></label><button id="play">Play from start</button><label>Time <input id="timeline" type="range" min="0" step="0.001" value="0"></label><output aria-live="off"></output></nav><canvas aria-label="Original event artwork"></canvas><script type="module" src="/review.js"></script></html>`;
const types = { '.json': 'application/json', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); return; }
    if (path === '/review.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bundle.outputFiles[0].contents); return; }
    const file = resolve(root, '.' + decodeURIComponent(path));
    if (!file.startsWith(root + sep) || !types[extname(file)]) { response.writeHead(404); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local native pack review: http://127.0.0.1:${port}`));
