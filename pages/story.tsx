import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { useMemo, useState } from 'react';
import StoryDataDialog from '@/components/story/StoryDataDialog';
import { chapterProgress, chapterRead, useStoryProgress } from '@/lib/story/storyProgress';
import ChapterDialog from '@/components/story/ChapterDialog';
import StoryMapView, { type ChapterOpener } from '@/components/story/StoryMapView';
import { withContentPage } from '@/lib/content/server';
import { useQueryState } from '@/lib/hooks/useQueryState';
import type { StoryLink, StoryMap } from '@/lib/story/storyMap';
import type { StoryChapters } from '@/lib/story/storyChapters';
import type { StoryLibraryEntry } from '@/lib/story/storyLibrary';

/*
 * Where to read Arknights' story, and in what order: Timo's story reader, which has every
 * chapter of every server's script, and the Arknights Story Map, a community whiteboard of
 * which stories lead into which, drawn here with each story a link to its chapters: a popup of its
 * sections, a stage's Before and After side by side, each opening that part in the reader
 * (components/story/ChapterDialog.tsx), at /story?chapter=<group> so a chapter can be linked.
 */

const READER = 'https://arknights.timo.beer/index.html';

interface Props {
  /** The board, as scripts/imports/import_story_map.py reads it (lib/story/storyMap.ts). */
  map: StoryMap;
  /** Each chapter's sections (data/story-chapters.json). Absent from a release compiled before the
   *  popup: every story then links straight into the reader, as it did. */
  chapters?: StoryChapters;
  library?: StoryLibraryEntry[];
}

export default function StoryPage({ map, chapters = {}, library = [] }: Props) {
  const [chapter, setChapter] = useQueryState('chapter', '');
  const progress = useStoryProgress();
  const [transfer, setTransfer] = useState(false);
  // The map's picture for a chapter: its link (title, the reader's address) and its art.
  const pictures = useMemo(() => new Map(map.elements.flatMap((element) =>
    element.type === 'picture' && element.link?.story && element.link.url ? [[element.link.story, { link: element.link as StoryLink & { url: string; story: string },
      // Its box on the board has the picture's own shape: the dialog shows the cover whole at it.
      image: element.image && element.width > 0 && element.height > 0 ? { src: element.image, ratio: element.width / element.height } : null }] as const] : [])), [map]);
  const links = useMemo(() => new Map(library.map(entry => [entry.id, entry])), [library]);
  const opener = useMemo<ChapterOpener>(() => ({ has: (story) => !!story && !!chapters[story]?.length && (links.has(story) || pictures.has(story)), open: setChapter,
    isRead: (story) => !!story && chapterRead(progress, story, chapters[story] ?? []),
    progressLabel: (story) => story && chapters[story]?.length ? chapterProgress(progress, story, chapters[story]).label : undefined }), [chapters, links, pictures, setChapter, progress]);
  const entry = links.get(chapter);
  const shown = opener.has(chapter) ? { link: entry ? { title: entry.title, url: entry.url, story: entry.id } : pictures.get(chapter)!.link, image: pictures.get(chapter)?.image ?? null } : null;
  return (
    <>
      <Head><title>Story — Arkpedia</title></Head>
      <PageHeader slim compact eyebrow="Rhodes Island // Story" title="Story" actions={
          <button type="button" className="ghost btn-sm" onClick={() => setTransfer(true)}>Import / export</button>
        }
        />
      <main>
        <section className="op-section" aria-labelledby="story-map">
          <h2 id="story-map">Story library</h2>
          <p className="hint story-map-credit">
            <a href={READER} target="_blank" rel="noopener noreferrer">Timo&apos;s reader ↗</a> · <Link prefetch={false} href="/manga">Manga</Link> · <a href={map.source} target="_blank" rel="noopener noreferrer">{map.title}</a>
          </p>
          {chapter && !shown && <p className="hint" role="status">This chapter is not available in the current catalogue. <a href={entry?.url ?? READER} target="_blank" rel="noopener noreferrer">Open Timo&apos;s reader ↗</a></p>}
          <StoryMapView map={map} chapters={opener} library={library} />
        </section>
      </main>
      {shown && <ChapterDialog link={shown.link} image={shown.image} sections={chapters[chapter]} onClose={() => setChapter('')} />}
      {transfer && <StoryDataDialog onClose={() => setTransfer(false)} />}
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /story, and on Vercel there is no data/
   to build it from. The builder reads only the map compiled into the bundle (a JSON import);
   once a release carries the page, the map comes from the release, so a change to the board
   reaches readers without a deployment. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/story', async () => {
  const { bundledStoryChapters, bundledStoryMap, bundledStoryLibrary } = await import('@/lib/story/storyMapData');
  return { props: { map: bundledStoryMap(), chapters: bundledStoryChapters(), library: bundledStoryLibrary() } };
}, { bundledWhenUnpublished: true, finalize: async props => {
  // Releases exported before the library existed still get this deployment's complete list.
  if (props.library) return props;
  const { bundledStoryChapters, bundledStoryLibrary } = await import('@/lib/story/storyMapData');
  return { ...props, library: bundledStoryLibrary(), chapters: { ...bundledStoryChapters(), ...props.chapters } };
} });
