#!/usr/bin/env node
/** Independently add verified English stories when the external reader lacks a released event. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { nativeStoryEntries, nativeStoryGroups, storyScriptUrl } from '../lib/native-story.mjs';
import { beginStage } from '../lib/quarantine.mjs';
const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
export async function importNativeStories({ root = process.cwd(), fetcher = fetch, en = process.env.ARKPEDIA_EN || path.join(root, '.cache/upstream/en-gamedata'), revision, now = Date.now() } = {}) {
  const data = path.join(root, 'data');
  const previous = read(path.join(data, 'story-library.json'), { entries: [] });
  const previousChapters = read(path.join(data, 'story-chapters.json'), { chapters: {} });
  const previousNative = read(path.join(data, 'story-native.json'), { chapters: {} }).chapters;
  const report = beginStage(root, 'story-native');
  if (previous.entries.length < 400) throw Error('No complete story library exists; previous files stay.');
  const library = { entries: previous.entries.filter(entry => !entry.id.startsWith('native_')), chapters: previousChapters.chapters };
  let native = previousNative;
  try {
    const review = read(path.join(en, 'en/gamedata/excel/story_review_table.json'), null);
    if (!review || Object.keys(review).length < 100 || ['MAINLINE', 'ACTIVITY', 'MINI_ACTIVITY'].some(type => !Object.values(review).some(group => group.entryType === type))) throw Error('English story review table is incomplete.');
    revision ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: en, encoding: 'utf8' }).trim();
    const planned = nativeStoryGroups(review, library.entries.filter(entry => library.chapters[entry.id]?.length), revision, now);
    native = { ...previousNative };
    let checked = 0;
    for (const [key, chapter] of Object.entries(planned)) {
      // Validate every new script before offering a reader link. Reuse only exact pinned metadata.
      const previous = previousNative[key];
      try {
        if (previous?.revision !== chapter.revision || JSON.stringify(previous.sections) !== JSON.stringify(chapter.sections)) {
          if (checked + chapter.sections.length > 512) throw Error('New scripts queued for a later refresh.');
          for (const section of chapter.sections) {
            checked++;
            const response = await fetcher(storyScriptUrl(chapter.revision, section.path), { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw Error('Story script unavailable.');
            const text = await response.text();
            if (text.length > 2_000_000 || !text.trim() || !/\[(?:name=|Dialog|HEADER|Subtitle)/i.test(text)) throw Error('Invalid story script.');
          }
        }
        native[key] = chapter;
      } catch {
        if (previous) native[key] = previous;
        report.add({ key: `story-script:${key}`, action: 'kept-previous', reason: 'English story scripts could not be verified; the previous reading link is kept.' });
      }
    }
  } catch (error) {
    throw Error('English story tables could not refresh; previous story files stay.');
  }
  // Retain old fallback metadata for bookmarks; only currently missing groups enter the library.
  const timoIds = new Set(library.entries.filter(entry => library.chapters[entry.id]?.length).map(e => e.id));
  const additions = Object.fromEntries(Object.entries(native).filter(([key]) => !timoIds.has(key)));
  const entries = [...library.entries.filter(entry => !additions[entry.id]), ...nativeStoryEntries(additions)];
  const write = (file, value) => fs.writeFileSync(path.join(data, file), `${JSON.stringify(value)}\n`);
  write('story-native.json', { chapters: { ...previousNative, ...native } });
  write('story-library.json', { ...previous, entries });
  report.commit();
  console.log(`Story library: ${entries.length} groups; ${Object.keys(additions).length} use verified game scripts.`);
  return { entries, chapters: library.chapters, native: additions };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) importNativeStories().catch(error => { console.error(`Story refresh failed: ${error.message}`); process.exitCode = 1; });
