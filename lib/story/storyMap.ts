/*
 * The Arknights Story Map: a community whiteboard of which stories lead into which, read from
 * its public Canva page by scripts/imports/import_story_map.py into data/story-map.json, in board
 * units (Canva's own coordinates; the board is about 7,300 by 15,600). The Story page
 * (pages/story.tsx) draws it as it is laid out, and each picture links to its story.
 */

/** Where a picture goes: a chapter in Timo's story reader, another site, or nowhere (url null:
 *  a manga the reader does not carry), with the title it is announced by either way. */
export interface StoryLink { title: string; url: string | null; story?: string }

interface Box { x: number; y: number; width: number; height: number }

export interface StoryText {
  text: string; size: number; color: string; align: 'left' | 'center' | 'right';
  bold: boolean; italic: boolean; underline: boolean;
}

export type StoryElement =
  | ({ type: 'picture'; id: string; image: string | null; link?: StoryLink } & Box)
  | ({ type: 'text' } & Box & StoryText)
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: number[] | null }
  | ({ type: 'shape'; path: string; fill: string | null; stroke: string | null; strokeWidth: number; radius: number; label?: StoryText } & Box);

export interface StoryMap {
  source: string;
  title: string;
  reader: string;
  bounds: Box;
  elements: StoryElement[];
}

/** The shape every element the page draws must have. A map that breaks it fails the build
 *  rather than drawing a board with holes in it. */
export function assertStoryMap(value: unknown): asserts value is StoryMap {
  const map = value as StoryMap;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!map || !Array.isArray(map.elements) || !map.bounds || ![map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height].every(finite)) {
    throw new Error('data/story-map.json: no board (bounds and elements)');
  }
  const pictures = map.elements.filter((element) => element.type === 'picture');
  if (pictures.length < 10) throw new Error(`data/story-map.json: ${pictures.length} pictures; the board reads as nearly empty`);
  for (const element of map.elements) {
    if (element.type === 'line') {
      if (![element.x1, element.y1, element.x2, element.y2, element.width].every(finite)) throw new Error('data/story-map.json: a line without its ends');
      continue;
    }
    if (![element.x, element.y, element.width, element.height].every(finite)) throw new Error(`data/story-map.json: a ${element.type} without its box`);
    if (element.type === 'picture') {
      if (element.image !== null && !/^story-map\/[\w-]+\.webp$/.test(element.image)) throw new Error(`data/story-map.json: picture ${element.id} names ${element.image}`);
      if (element.link && (typeof element.link.title !== 'string' || !(element.link.url === null || /^https:\/\//.test(element.link.url)))) {
        throw new Error(`data/story-map.json: picture ${element.id} has a link that is not a title and an https address`);
      }
    }
  }
}

export type StoryPicture = Extract<StoryElement, { type: 'picture' }>;

/**
 * The board's stories in its own sections, for the List view: a section is a labelled frame (an
 * outlined, unfilled box at least a picture's size, named by the text at its top left), and a
 * picture outside every frame joins the section of the framed picture nearest it, which on the
 * board is the one it hangs off. The main story's sections come first, then the rest left to
 * right; inside a section, left to right, as the board reads.
 */
export function storySections(map: StoryMap): { name: string; stories: StoryPicture[] }[] {
  const center = (box: Box) => [box.x + box.width / 2, box.y + box.height / 2] as const;
  const within = (box: Box, frame: Box) => {
    const [cx, cy] = center(box);
    return cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y && cy <= frame.y + frame.height;
  };
  const texts = map.elements.filter((element): element is Extract<StoryElement, { type: 'text' }> => element.type === 'text');
  const pictures = map.elements.filter((element): element is StoryPicture => element.type === 'picture');
  const frames = map.elements
    .filter((element): element is Extract<StoryElement, { type: 'shape' }> => element.type === 'shape' && !element.fill && !!element.stroke
      && element.width >= 300 && element.height >= 300)
    .map((frame) => {
      const name = texts
        .filter((text) => text.x >= frame.x - 20 && text.x <= frame.x + frame.width / 2 && text.y >= frame.y - 20 && text.y <= frame.y + 150)
        .sort((a, b) => a.y - b.y || a.x - b.x)[0]?.text.trim();
      return { frame, name };
    })
    .filter((entry): entry is { frame: typeof entry.frame; name: string } => !!entry.name);
  const home = new Map<string, { frame: Box; name: string }>();
  for (const picture of pictures) {
    const holding = frames.filter(({ frame }) => within(picture, frame)).sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)[0];
    if (holding) home.set(picture.id, holding);
  }
  for (const picture of pictures) {
    if (home.has(picture.id)) continue;
    const [px, py] = center(picture);
    const nearest = pictures.filter((other) => home.has(other.id))
      .map((other) => { const [ox, oy] = center(other); return { other, distance: Math.hypot(ox - px, oy - py) }; })
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest) home.set(picture.id, home.get(nearest.other.id)!);
  }
  const sections = new Map<string, { name: string; frame: Box; stories: StoryPicture[] }>();
  for (const picture of pictures) {
    const at = home.get(picture.id) ?? { name: 'Elsewhere on the map', frame: map.bounds };
    const section = sections.get(at.name) ?? { name: at.name, frame: at.frame, stories: [] };
    section.stories.push(picture);
    sections.set(at.name, section);
  }
  const main = (name: string) => (/main story/i.test(name) ? 0 : 1);
  return [...sections.values()]
    .sort((a, b) => main(a.name) - main(b.name) || a.frame.x - b.frame.x || a.frame.y - b.frame.y)
    .map(({ name, stories }) => ({ name, stories: stories.sort((a, b) => a.x - b.x || a.y - b.y) }));
}
