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
  /** Wraps inside its width: the page's own texts (withManga), whose words the browser
   *  measures in the site's font. The board's texts break their own lines and never wrap. */
  wrap?: boolean;
}

export type StoryElement =
  /** `manga`: an official comic the page adds below the board, not one of the board's own. */
  | ({ type: 'picture'; id: string; image: string | null; link?: StoryLink; manga?: true } & Box)
  | ({ type: 'text' } & Box & StoryText)
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: number[] | null }
  | ({ type: 'shape'; path: string; fill: string | null; stroke: string | null; strokeWidth: number; radius: number; label?: StoryText } & Box);

/** An official comic from the Global site's list (scripts/imports/import_story_map.py): `section`
 *  is the board section it belongs to, or null for one nobody has placed yet; `onBoard` the board
 *  picture it already is. The blurb, chapter count and update date are the site's own. */
export interface StoryManga {
  id: string; title: string; url: string; image: string | null; section: string | null; onBoard?: string;
  description?: string; chapters?: number; latestUrl?: string; updated?: string;
}

export interface StoryMap {
  source: string;
  title: string;
  reader: string;
  bounds: Box;
  elements: StoryElement[];
  /** Absent from a map imported before the manga were. */
  manga?: StoryManga[];
}

/** The List view's and the map's name for the comics nobody has placed in the story. */
export const UNPLACED = 'Not yet categorized';
export const UNPLACED_NOTE = 'Not reviewed: these have not been placed in the story yet, and are listed here for completeness.';

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
  for (const comic of map.manga ?? []) {
    if (typeof comic.title !== 'string' || !/^https:\/\//.test(comic.url) || !(comic.section === null || typeof comic.section === 'string')
      || !(comic.image === null || /^story-map\/[\w-]+\.webp$/.test(comic.image))) {
      throw new Error(`data/story-map.json: manga ${comic.id} needs a title, an https address, a section or null, and a story-map/ image or null`);
    }
  }
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

/** A comic as one of the List view's stories. */
function asStory(comic: StoryManga): StoryPicture {
  return { type: 'picture', id: comic.id, image: comic.image, link: { title: comic.title, url: comic.url }, manga: true, x: 0, y: 0, width: 0, height: 0 };
}

/** The comics to show beside the board: all but those that are a board picture already. */
const offBoard = (map: StoryMap) => (map.manga ?? []).filter((comic) => !comic.onBoard);

/**
 * The List view's sections: the board's own (storySections), each followed by the comics placed
 * in it, and last the comics nobody has placed, under UNPLACED. A comic naming a section the
 * board has no frame for is listed as unplaced rather than lost.
 */
export function storyListSections(map: StoryMap): { name: string; note?: string; stories: StoryPicture[] }[] {
  const sections = storySections(map).map((section) => ({ ...section, stories: [...section.stories] as StoryPicture[] }));
  const byName = new Map(sections.map((section) => [section.name.toLowerCase(), section]));
  const unplaced: StoryPicture[] = [];
  for (const comic of offBoard(map)) {
    const section = comic.section ? byName.get(comic.section.trim().toLowerCase()) : undefined;
    (section ? section.stories : unplaced).push(asStory(comic));
  }
  return unplaced.length ? [...sections, { name: UNPLACED, note: UNPLACED_NOTE, stories: unplaced }] : sections;
}

/**
 * The map with the official comics drawn below the board, in the board's own vocabulary (frames,
 * labels, pictures), so it pans and zooms with it: a "Manga" frame holding one framed group per
 * section, in the board's section order, and last the comics nobody has placed, under UNPLACED
 * with UNPLACED_NOTE. Each cover links to its comic. A map without comics comes back as it was.
 */
export function withManga(map: StoryMap): StoryMap {
  const comics = offBoard(map);
  if (!comics.length) return map;
  const order = storySections(map).map((section) => section.name);
  const named = new Map(order.map((name) => [name.toLowerCase(), name]));
  const groups = new Map<string, StoryManga[]>();
  for (const comic of comics) {
    const name = (comic.section && named.get(comic.section.trim().toLowerCase())) || UNPLACED;
    groups.set(name, [...(groups.get(name) ?? []), comic]);
  }
  const ordered = [...order.filter((name) => groups.has(name)), ...(groups.has(UNPLACED) ? [UNPLACED] : [])];

  const ink = '#000000';
  const { bounds } = map;
  const card = { width: 420, height: 284, gap: 40 }, pad = 50, title = 40;
  const left = bounds.x + 40, top = bounds.y + bounds.height + 160, width = bounds.width - 80;
  const added: StoryElement[] = [];
  const text = (x: number, y: number, w: number, value: string, size: number, extra: Partial<StoryText> = {}): StoryElement =>
    ({ type: 'text', x, y, width: w, height: size * 1.3 * value.split('\n').length, text: value, size, color: ink, align: 'left', bold: false, italic: false, underline: false, ...extra });
  added.push(text(left + 60, top + 40, width - 120, 'Manga', 106, { bold: true }));
  added.push(text(left + 60, top + 200, width - 120, 'The official comics, added by Arkpedia: they are not on the original map. Click a cover to read it.', 53, { italic: true, wrap: true }));

  let x = left + 60, y = top + 330, rowHeight = 0, right = left + 60;
  for (const name of ordered) {
    const list = groups.get(name)!;
    const note = name === UNPLACED;
    const inner = Math.max(list.length * (card.width + card.gap) - card.gap, note ? 1500 : name.length * 48);
    const w = inner + 2 * pad;
    /* The titles wrap in the browser, in the site's font, inside their cover's width; the box
       is sized for the most lines the longest could take (about 0.62em a character, which
       errs wide), so a title never runs past its frame. */
    const lines = (value: string, size: number, width: number) => Math.ceil((value.length * size * 0.62) / width);
    const titleLines = Math.max(...list.map((comic) => lines(comic.title, title, card.width)));
    const noteLines = note ? lines(UNPLACED_NOTE, 45, inner) : 0;
    const h = pad + 110 + noteLines * 45 * 1.3 + (note ? 20 : 0) + card.height + 24 + titleLines * title * 1.3 + pad;
    if (x + w > left + width - 60 && x > left + 60) { x = left + 60; y += rowHeight + 80; rowHeight = 0; }
    added.push({ type: 'shape', x, y, width: w, height: h, path: 'M0 0H64V64H0z', fill: null, stroke: ink, strokeWidth: 7, radius: 0 });
    added.push(text(x + pad, y + pad - 10, inner, name, 80));
    let cy = y + pad + 110;
    if (note) { added.push(text(x + pad, cy - 20, inner, UNPLACED_NOTE, 45, { italic: true, wrap: true })); cy += noteLines * 45 * 1.3 + 20; }
    list.forEach((comic, index) => {
      const cx = x + pad + index * (card.width + card.gap);
      added.push({ type: 'picture', id: comic.id, image: comic.image, link: { title: comic.title, url: comic.url }, manga: true, x: cx, y: cy, width: card.width, height: card.height });
      added.push(text(cx, cy + card.height + 24, card.width, comic.title, title, { wrap: true }));
    });
    right = Math.max(right, x + w);
    x += w + 80;
    rowHeight = Math.max(rowHeight, h);
  }
  const bottom = y + rowHeight + 80;
  // As wide as what it holds, not the whole board: one short row of groups in a frame the
  // board's width left most of it empty.
  added.unshift({ type: 'shape', x: left, y: top, width: Math.max(right + 60 - left, 2400), height: bottom - top, path: 'M0 0H64V64H0z', fill: null, stroke: '#ce7835', strokeWidth: 7, radius: 0 });
  return { ...map, bounds: { ...bounds, height: bottom + 40 - bounds.y }, elements: [...map.elements, ...added] };
}
