/**
 * The Story page's chapter popup: each chapter in the library, section by section, from Timo's story
 * reader (data/story-chapters.json, scripts/imports/import-story-chapters.mjs). A section is
 * [index, code, name, tag]: its place in the reader's chapter, which a link opens it by; the stage
 * code ("3-1"), its name ("Meeting"), and whether it is the stage's story before the operation, after
 * it, the chapter's opening video, or a story of its own (an interlude, a prologue part).
 */
export type SectionTag = 'before' | 'after' | 'intro' | '';
export type Section = [index: number, code: string, name: string, tag: SectionTag];
export type StoryChapters = Record<string, Section[]>;

/** Pre-library releases contain only canvas chapters. Complete catalogues own omissions. */
export function storyChaptersForRelease(published: StoryChapters, bundled: StoryChapters, complete: boolean): StoryChapters {
  return complete ? published : { ...bundled, ...published };
}

/** One row of the popup: a stage with its Before and After, or a story read on its own. */
export interface ChapterRow {
  code: string;
  name: string;
  before?: number;
  after?: number;
  /** A story with no Before or After: the opening video, an interlude, a prologue part. */
  read?: number;
}

/** The popup's rows: a stage's Before and After side by side (myrtle.moe's layout, the maintainer's
 *  choice), in the reader's order, which is the story's. */
export function chapterRows(sections: Section[]): ChapterRow[] {
  const rows: ChapterRow[] = [];
  for (const [index, code, name, tag] of sections) {
    if (tag === 'before' || tag === 'after') {
      const last = rows[rows.length - 1];
      // The stage's other half when it is the row just before, as Before and After follow each other.
      if (last && last.read === undefined && last.code === code && last.name === name && last[tag] === undefined) { last[tag] = index; continue; }
      rows.push({ code, name, [tag]: index });
    } else {
      rows.push({ code: tag === 'intro' ? '' : code, name, read: index });
    }
  }
  return rows;
}

/** A section's address in Timo's reader, from the chapter's own link on the map
 *  ("https://arknights.timo.beer/story.html#main&main_3&0"): the same category and group, at `index`. */
export function readerLink(chapterUrl: string, index: number): string {
  const [base, hash = ''] = chapterUrl.split('#');
  const [category, group] = hash.split('&');
  return `${base}#${category}&${group}&${index}`;
}
