/** Build-time catalogue generation for the selected Classics and full stage pool. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import externalAssets from '@/data/assets/external-asset-index.json';
import { publicFileExists } from '@/lib/assets/publicAssets';
import curated from '@/data/stage-guesser.json';
import { tileStyle } from '@/lib/stages/stageTiles';
import tileDescriptions from '@/data/stage-tile-legend.json';
import type { Stage, StageGeometry } from '@/lib/stages/stageTypes';
import type { StageCollection, StageQuestion, StageEntry, StageLayout, StageGroup, StageAnswer } from './stageGuesser';

// Later story H stages only exist in Adverse Environment. They are distinct
// stages, not optional difficulty copies of a normal map.
export function isStageGuesserVersion(stage: Stage): boolean {
  return !stage.variant || (stage.content?.kind === 'story' && /^H\d+-\d+$/.test(stage.code || '')
    && stage.variant.kind === 'adverse_environment' && !stage.variant.shares_parent_level_file);
}

// The dataset uses country names as Annihilation codes. Use the familiar original
// Annihilation numbering in the answer picker, with the stage's full name beside it.
const ANNIHILATION_LABELS: Record<string, number> = { ursus_camp_01: 1, yan_camp_02: 2, yan_camp_03: 3 };
const externalDigests = externalAssets.sha256 as Record<string, string>;

/* The published map's digest, from the asset index alone (data/assets/external-asset-index.json):
   the file a reader is shown, never a local copy under public/, which no export machine has and
   which could differ from it. A new curated entry's mapSha256 is therefore the index's sha256 for
   its stages-images/ file, after the asset sync has published and indexed it. */
function stageMapDigest(filename: string): string | null {
  return externalDigests[`stages-images/${filename}`] || null;
}
function answerLabels(stage: Stage) {
  const number = ANNIHILATION_LABELS[stage.slug];
  return number ? { code: `Annihilation ${number}`, aliases: [`Anni ${number}`] } : { code: stage.code! };
}

export function getStageGuesserQuestions(asOf = new Date()): StageQuestion[] {
  const questions: StageQuestion[] = [];
  const seenSlugs = new Set<string>();
  const seenImages = new Set<string>();
  for (const entry of curated.stages) {
    if (seenSlugs.has(entry.slug)) throw new Error(`Duplicate Stage Guesser entry: ${entry.slug}`);
    seenSlugs.add(entry.slug);
    const stage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/stages', `${entry.slug}.json`), 'utf8')) as Stage;
    if (!isStageGuesserVersion(stage) || stage.slug !== entry.slug || !stage.code || !stage.name) throw new Error(`Stage Guesser requires a named playable stage: ${entry.slug}`);
    const content = stage.content;
    if (!content || !['story', 'event', 'supply', 'annihilation'].includes(content.kind)) throw new Error(`Unsupported Stage Guesser content: ${entry.slug}`);
    // Fail closed for unconfirmed/future Global releases. Reruns are not separate questions.
    const released = content.release_date ? Date.parse(`${content.release_date}T00:00:00Z`) : NaN;
    if (!Number.isFinite(released) || released > asOf.getTime()) continue;
    const filename = path.basename(stage.preview || '').replace(/\.[a-z]+$/i, '.webp');
    if (!filename.endsWith('.webp')) throw new Error(`Missing Stage Guesser map: ${entry.slug}`);
    const digest = stageMapDigest(filename);
    if (!digest) throw new Error(`Invalid Stage Guesser map: ${entry.slug}`);
    if (digest !== entry.mapSha256) throw new Error(`Re-review changed Stage Guesser map: ${entry.slug}`);
    if (seenImages.has(digest)) throw new Error(`Ambiguous duplicate map in Stage Guesser: ${entry.slug}`);
    seenImages.add(digest);
    const geometry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/stage-geometry', `${entry.slug}.json`), 'utf8')) as StageGeometry;
    const { rows, cols, tileLegend, tileGrid } = geometry;
    if (geometry.slug !== stage.slug || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1
      || tileGrid.length !== rows || tileGrid.some((row) => row.length !== cols || row.some((tile) => !Number.isInteger(tile) || !tileLegend[tile]))) {
      throw new Error(`Invalid Stage Guesser layout: ${entry.slug}`);
    }
    questions.push({
      slug: stage.slug, ...answerLabels(stage), name: stage.name, collection: content.kind as StageCollection,
      version: stage.variant?.label || 'Normal version',
      image: `/stages-images/${encodeURIComponent(filename)}`, source: [content.label, content.name].filter(Boolean).join(' · '),
      chapter: content.kind === 'story' ? Number(content.label?.match(/^EP\s*0*(\d+)$/)?.[1]) || null : null,
      layout: { rows, cols, tileGrid, tileLegend: tileLegend.map((tile) => {
        const info = (tileDescriptions as Record<string, { name?: string; description?: string }>)[tile.key];
        return { ...tile, name: info?.name || tile.key.replace(/^tile_/, '').replace(/_/g, ' '), description: info?.description || '' };
      }) }, reason: entry.reason,
    });
  }
  return questions;
}

/** Full catalogue stays out of page props; fetch metadata once and one compact layout per round. */
export function buildStageGuesserCatalogue(asOf = new Date()) {
  const classic = new Map(getStageGuesserQuestions(asOf).map((q) => [q.slug, q]));
  const entries: StageEntry[] = [];
  const answers: StageAnswer[] = [];
  const layouts = new Map<string, StageLayout>();
  const layoutNames = new Map<string, string>();
  const groups = new Map<string, StageGroup>();
  const seen = new Set<string>();
  for (const file of fs.readdirSync(path.join(process.cwd(), 'data/stages')).sort()) {
    if (!file.endsWith('.json')) continue;
    const stage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/stages', file), 'utf8')) as Stage;
    const c = stage.content;
    const released = c?.release_date ? Date.parse(`${c.release_date}T00:00:00Z`) : NaN;
    if (!c || !isStageGuesserVersion(stage) || !stage.code || !stage.name || !Number.isFinite(released) || released > asOf.getTime()) continue;
    // Answer eligibility does not depend on a usable question image/layout.
    const answer: StageAnswer = { slug: stage.slug, ...answerLabels(stage), name: stage.name,
      source: [c.label, c.name].filter(Boolean).join(' · '),
      chapter: c.kind === 'story' ? stage.chapter ?? Number(c.label?.match(/^EP\s*0*(\d+)$/)?.[1] ?? 0) : null };
    answers.push(answer);
    const geometryPath = path.join(process.cwd(), 'data/stage-geometry', `${stage.slug}.json`);
    const filename = path.basename(stage.preview || '').replace(/\.[a-z]+$/i, '.webp');
    if (!filename.endsWith('.webp') || !publicFileExists(`/stages-images/${filename}`) || !fs.existsSync(geometryPath)) continue;
    const g = JSON.parse(fs.readFileSync(geometryPath, 'utf8')) as StageGeometry;
    if (g.slug !== stage.slug || !Number.isInteger(g.rows) || !Number.isInteger(g.cols) || g.rows < 1 || g.cols < 1
      || g.tileGrid.length !== g.rows || g.tileGrid.some((r) => r.length !== g.cols || r.some((t) => !Number.isInteger(t) || !g.tileLegend[t]))) continue;
    const layout: StageLayout = { rows: g.rows, cols: g.cols, tileGrid: g.tileGrid, tileLegend: g.tileLegend.map((t) => ({ ...t,
      ...(tileDescriptions as Record<string, { name?: string; description?: string }>)[t.key] })) };
    // Tile indices/unused legend entries are not visual differences. Accept indistinguishable layouts.
    const visual = g.tileGrid.map((row) => row.map((i) => { const t = g.tileLegend[i]; return { high: t.height === 'high', style: tileStyle({ k: t.key, high: t.height === 'high', build: t.deployable, walk: t.walkable, fly: t.flyable }) }; }));
    const mapKey = crypto.createHash('sha256').update(JSON.stringify(visual)).digest('hex').slice(0, 20);
    answer.mapKey = mapKey;
    const duplicateKey = `${stage.code}:${mapKey}`;
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const hash = crypto.createHash('sha256').update(JSON.stringify(layout)).digest('hex').slice(0, 20);
    // Reuse identical layouts, naming the file after the first stage in the
    // deterministic catalogue order. Hashes remain internal comparison keys.
    const layoutName = layoutNames.get(hash) || stage.slug;
    layoutNames.set(hash, layoutName);
    layouts.set(layoutName, layout);
    const source = [c.label, c.name].filter(Boolean).join(' · ');
    const groupId = `${c.kind}:${c.id}`;
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, label: source, kind: c.kind as StageCollection, count: 0 });
    groups.get(groupId)!.count++;
    entries.push({ slug: stage.slug, ...answerLabels(stage), name: stage.name, source, collection: c.kind as StageCollection,
      chapter: c.kind === 'story' ? stage.chapter ?? Number(c.label?.match(/^EP\s*0*(\d+)$/)?.[1] ?? 0) : null,
      image: `/stages-images/${encodeURIComponent(filename)}`, reason: classic.get(stage.slug)?.reason || '',
      version: stage.variant?.label || 'Normal version',
      groupId,
      classic: classic.has(stage.slug), mapKey, layoutUrl: `/stage-guesser/layouts/${encodeURIComponent(layoutName)}.json` });
  }
  const questionSlugs = new Set(entries.map((entry) => entry.slug));
  const answerKeys = new Set<string>();
  const uniqueAnswers = [...answers.filter((answer) => questionSlugs.has(answer.slug)), ...answers.filter((answer) => !questionSlugs.has(answer.slug))].filter((answer) => {
    const key = answer.mapKey ? `${answer.code}:${answer.mapKey}` : answer.slug;
    if (answerKeys.has(key)) return false;
    answerKeys.add(key); return true;
  });
  return { entries, answers: uniqueAnswers, layouts, groups: [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, undefined, { numeric: true })) };
}
