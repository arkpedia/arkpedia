import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StoryMapView from '@/components/story/StoryMapView';
import { withContentPage } from '@/lib/content/server';
import type { StoryMap } from '@/lib/story/storyMap';

/*
 * Where to read Arknights' story, and in what order: Timo's story reader, which has every
 * chapter of every server's script, and the Arknights Story Map, a community whiteboard of
 * which stories lead into which, drawn here with each story a link into the reader
 * (components/story/StoryMapView.tsx).
 */

const READER = 'https://arknights.timo.beer/index.html';

interface Props {
  /** The board, as scripts/imports/import_story_map.py reads it (lib/story/storyMap.ts). */
  map: StoryMap;
}

export default function StoryPage({ map }: Props) {
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
            a story to start reading it in Timo&apos;s reader.
          </p>
          <StoryMapView map={map} />
        </section>
      </main>
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /story, and on Vercel there is no data/
   to build it from. The builder reads only the map compiled into the bundle (a JSON import);
   once a release carries the page, the map comes from the release, so a change to the board
   reaches readers without a deployment. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/story', async () => {
  const { bundledStoryMap } = await import('@/lib/story/storyMapData');
  return { props: { map: bundledStoryMap() } };
}, { bundledWhenUnpublished: true });
