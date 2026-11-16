/** Missing reader groups may use the game's English scripts, never guessed Timo indices. */
export const STORY_SCRIPT_ROOT = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/';
const id = /^[a-zA-Z0-9_-]{1,80}$/;
const script = /^(?:activities|obt)\/[a-zA-Z0-9_/-]+$/;
export function nativeStoryGroups(review, existing, revision, now = Date.now()) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Native stories require a pinned game-data revision.');
  const known = new Set(existing.filter(e => !e.id.startsWith('native_')).map(e => e.id));
  const chapters = {};
  for (const [key, group] of Object.entries(review ?? {})) {
    if (!id.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key) || known.has(key) || !['MAINLINE', 'ACTIVITY', 'MINI_ACTIVITY'].includes(group.entryType)) continue;
    if (!(group.startTime > 0 && group.startTime * 1000 <= now)) continue;
    const rows = group.infoUnlockDatas;
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) continue;
    const sections = rows.map(row => ({ code: row.storyCode ?? '', title: row.storyName ?? '', path: row.storyTxt,
      // The game owns these stable orders; keep progress separate from Timo's positional indices.
      index: row.storySort, tag: row.avgTag === 'Before Operation' ? 'before' : row.avgTag === 'After Operation' ? 'after' : '' }));
    if (sections.some(s => !script.test(s.path ?? '') || s.path.includes('..') || !Number.isSafeInteger(s.index) || s.index < 0 || s.index >= 10000 || typeof s.title !== 'string' || typeof s.code !== 'string')) continue;
    if (new Set(sections.map(s => s.index)).size !== sections.length) continue;
    chapters[key] = { title: group.name || key, category: key.startsWith('main_') ? 'main' : group.entryType === 'MINI_ACTIVITY' ? 'mini' : 'side', revision, sections };
  }
  return chapters;
}
export function nativeStoryEntries(chapters) {
  return Object.entries(chapters).map(([id, chapter]) => ({ id: `native_${id}`, title: chapter.title, category: chapter.category, url: `/story/read?chapter=${encodeURIComponent(id)}` }));
}
export function storyScriptUrl(revision, path) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '') || !script.test(path ?? '') || path.includes('..')) throw Error('Invalid story script.');
  return `${STORY_SCRIPT_ROOT}${revision}/en/gamedata/story/${path}.txt`;
}
