export interface NativeStorySection { index: number; code: string; title: string; path: string; tag: string }
export interface NativeStoryChapter { title: string; category: 'main' | 'side' | 'mini'; revision: string; sections: NativeStorySection[] }
export type NativeStories = Record<string, NativeStoryChapter>;
export interface StoryLine { speaker?: string; text: string; kind: 'dialogue' | 'narration' | 'choice' }
const clean = (text: string) => text.replace(/<\/?(?:color|size|b|i|u|span)(?:\s[^>]*|=[^>]*)?>/gi, '').replace(/\\n/g, '\n').replace(/\{(?:nickname|playerName)\}/g, 'Doctor');
const quoted = (line: string, field: string) => {
  const value = new RegExp(`(?:^|[,(\\s])${field}="((?:\\\\.|[^"\\\\])*)"`).exec(line)?.[1];
  return value?.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};
/** Display text only. Scene, sound and animation commands are never executed or rendered as HTML. */
export function parseNativeStory(text: string): StoryLine[] {
  if (text.length > 2_000_000) throw Error('This story is too large to display.');
  const lines: StoryLine[] = [];
  let choices = new Map<string, string>();
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const dialogue = /^\[name="((?:\\.|[^"\\])*)"\](.*)$/.exec(line);
    if (dialogue) { lines.push({ speaker: clean(dialogue[1].replace(/\\"/g, '"')), text: clean(dialogue[2]), kind: 'dialogue' }); continue; }
    if (/^\[Decision\(/i.test(line)) {
      const options = quoted(line, 'options');
      if (options) {
        const labels = options.split(';').map(clean), values = quoted(line, 'values')?.split(';');
        choices = new Map(labels.map((label, i) => [values?.[i] ?? String(i + 1), label]));
        lines.push({ text: labels.map((label, i) => `${i + 1}. ${label}`).join('\n'), kind: 'choice' });
      }
      continue;
    }
    if (/^\[Predicate\(/i.test(line)) {
      const references = quoted(line, 'references');
      if (references && references !== '*') lines.push({ text: `Choice: ${references.split(';').map(value => choices.get(value) ?? value).join(' / ')}`, kind: 'choice' });
      continue;
    }
    if (/^\[(?:Subtitle|Sticker)\(/i.test(line)) {
      const value = quoted(line, 'text');
      if (value) lines.push({ text: clean(value), kind: 'narration' });
      continue;
    }
    if (!line.startsWith('[')) lines.push({ text: clean(line), kind: 'narration' });
  }
  return lines.filter(line => line.text.trim());
}
export function nativeScriptUrl(revision: string, path: string): string {
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^(?:activities|obt)\/[a-zA-Z0-9_/-]+$/.test(path) || path.includes('..')) throw Error('Invalid story source.');
  return `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${revision}/en/gamedata/story/${path}.txt`;
}
