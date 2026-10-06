import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { useMemo } from 'react';
import ChapterDialog from '@/components/story/ChapterDialog';
import StoryMapView, { type ChapterOpener } from '@/components/story/StoryMapView';
import { withContentPage } from '@/lib/content/server';
import { useQueryState } from '@/lib/hooks/useQueryState';
import type { StoryLink, StoryMap } from '@/lib/story/storyMap';
import type { StoryChapters } from '@/lib/story/storyChapters';

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
}

export default function StoryPage({ map, chapters = {} }: Props) {
  const [chapter, setChapter] = useQueryState('chapter', '');
  // The map's picture for a chapter: its link (title, the reader's address) and its art.
  const pictures = useMemo(() => new Map(map.elements.flatMap((element) =>
    element.type === 'picture' && element.link?.story && element.link.url ? [[element.link.story, { link: element.link as StoryLink & { url: string; story: string }, image: element.image }] as const] : [])), [map]);
  const opener = useMemo<ChapterOpener>(() => ({ has: (story) => !!story && !!chapters[story]?.length && pictures.has(story), open: setChapter }), [chapters, pictures, setChapter]);
  const shown = opener.has(chapter) ? pictures.get(chapter)! : null;
  return (
    <>
      <Head><title>Story — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // Story" title="Story"
        sub="Read Arknights' story outside the game, and find where to start." />
      <main>
        <section className="op-section story-links" aria-labelledby="story-read">
          <h2 id="story-read">Read the story</h2>
          <div className="story-link-grid">
            <a className="story-link-card" href={READER} target="_blank" rel="noopener noreferrer">
              <strong>Timo&apos;s Arknights Story Reader <span aria-hidden="true">↗</span></strong>
              <span className="hint">Every main story, side story, vignette and operator record, read the way the game plays it.</span>
            </a>
            <Link prefetch={false} className="story-link-card" href="/manga">
              <strong>Arknights Manga</strong>
              <span className="hint">Every official comic from the Global site, each a link to read it there.</span>
            </Link>
          </div>
        </section>
        <section className="op-section" aria-labelledby="story-map">
          <h2 id="story-map">Story map</h2>
          <p className="hint story-map-credit">
            <a href={map.source} target="_blank" rel="noopener noreferrer">{map.title}</a>, kept up to date from the original. Click
            a story to choose where to start reading it in Timo&apos;s reader.
          </p>
          <StoryMapView map={map} chapters={opener} />
        </section>
      </main>
      {shown && <ChapterDialog link={shown.link} image={shown.image} sections={chapters[chapter]} onClose={() => setChapter('')} />}
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /story, and on Vercel there is no data/
   to build it from. The builder reads only the map compiled into the bundle (a JSON import);
   once a release carries the page, the map comes from the release, so a change to the board
   reaches readers without a deployment. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/story', async () => {
  const { bundledStoryChapters, bundledStoryMap } = await import('@/lib/story/storyMapData');
  return { props: { map: bundledStoryMap(), chapters: bundledStoryChapters() } };
}, { bundledWhenUnpublished: true });
