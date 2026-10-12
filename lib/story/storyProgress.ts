import { useSyncExternalStore } from 'react';
import type { Section } from './storyChapters';

export const STORY_PROGRESS_KEY = 'arkpedia.story-progress.v1';
export const STORY_PROGRESS_EVENT = 'arkpediaStoryProgressChanged';
export const STORY_FILE_KIND = 'arkpedia-story-progress';
export const MAX_STORY_BYTES = 2 * 1024 * 1024;
/** Timo's chapter IDs and section indices, the same identifiers used by reader links. */
export type StoryProgress = Record<string, number[]>;
const EMPTY: StoryProgress = {};

export function validateStoryProgress(value: unknown): StoryProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 2000) throw new Error('Invalid story progress.');
  const progress: StoryProgress = {};
  let total = 0;
  for (const [chapter, parts] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(chapter) || ['__proto__', 'constructor', 'prototype'].includes(chapter)
      || !Array.isArray(parts) || parts.length > 10000 || !parts.every(n => Number.isInteger(n) && n >= 0 && n < 10000)) throw new Error('Invalid story progress.');
    total += parts.length;
    if (total > 100000) throw new Error('This story file contains too many parts.');
    if (parts.length) progress[chapter] = [...new Set(parts)].sort((a, b) => a - b);
  }
  return progress;
}
export function parseStoryProgress(raw: string | null): StoryProgress | null {
  if (!raw || raw.length > MAX_STORY_BYTES) return null;
  try { return validateStoryProgress(JSON.parse(raw)); } catch { return null; }
}
export function parseStoryFile(text: string): StoryProgress {
  if (text.length > MAX_STORY_BYTES) throw new Error('Choose a story progress file smaller than 2 MB.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Choose an Arkpedia story progress JSON file.'); }
  if (!file || file.kind !== STORY_FILE_KIND || file.version !== 1) throw new Error('Choose an Arkpedia story progress JSON file.');
  return validateStoryProgress(file.progress);
}
export function formatStoryFile(progress: StoryProgress, now = new Date()): string {
  return JSON.stringify({ kind: STORY_FILE_KIND, version: 1, savedAt: now.toISOString(), progress: validateStoryProgress(progress) }, null, 2);
}
export function storyFilename(now = new Date()): string { return `arkpedia-story-progress-${now.toISOString().slice(0, 10)}.json`; }
export function chapterRead(progress: StoryProgress, chapter: string, sections: Section[]): boolean {
  return sections.length > 0 && sections.every(([index]) => progress[chapter]?.includes(index));
}
/** Only parts in the current chapter count; old/imported indices cannot inflate progress. */
export function chapterProgress(progress: StoryProgress, chapter: string, sections: Section[]): { label: string; next: number } {
  const read = new Set(progress[chapter] ?? []);
  const done = sections.filter(([index]) => read.has(index)).length;
  return {
    label: done === 0 ? 'Unread' : done === sections.length ? 'Read' : `${Math.round(done / sections.length * 100)}% read`,
    next: sections.find(([index]) => !read.has(index))?.[0] ?? sections[0]?.[0] ?? 0,
  };
}
/** Read afresh on every mutation, so another tab's progress is preserved. */
export function setStoryPart(progress: StoryProgress, chapter: string, index: number, read: boolean): StoryProgress {
  const parts = new Set(progress[chapter] ?? []);
  if (read) parts.add(index); else parts.delete(index);
  const next = { ...progress };
  if (parts.size) next[chapter] = [...parts].sort((a, b) => a - b); else delete next[chapter];
  return validateStoryProgress(next);
}
export function readStoryProgress(storage: Pick<Storage, 'getItem'>): StoryProgress {
  return parseStoryProgress(storage.getItem(STORY_PROGRESS_KEY)) ?? EMPTY;
}
export function writeStoryProgress(progress: StoryProgress): void {
  window.localStorage.setItem(STORY_PROGRESS_KEY, JSON.stringify(validateStoryProgress(progress)));
  window.dispatchEvent(new Event(STORY_PROGRESS_EVENT));
}
let raw: string | null | undefined;
let cached = EMPTY;
function snapshot() {
  let next: string | null = null;
  try { next = window.localStorage.getItem(STORY_PROGRESS_KEY); } catch { /* Storage is unavailable. */ }
  if (next !== raw) { raw = next; cached = parseStoryProgress(next) ?? EMPTY; }
  return cached;
}
function subscribe(change: () => void) {
  window.addEventListener('storage', change);
  window.addEventListener(STORY_PROGRESS_EVENT, change);
  return () => { window.removeEventListener('storage', change); window.removeEventListener(STORY_PROGRESS_EVENT, change); };
}
export function useStoryProgress(): StoryProgress { return useSyncExternalStore(subscribe, snapshot, () => EMPTY); }
