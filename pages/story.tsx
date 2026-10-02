import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';

/*
 * Where to read Arknights' story, and in what order: Timo's story reader, which has every
 * chapter of every server's script, and the Arknights Story Map, a community whiteboard of
 * which stories lead into which.
 */

const READER = 'https://arknights.timo.beer/index.html';
const STORY_MAP = 'https://www.canva.com/design/DAHBABXJpds/tgUQ72n0pCw8HHq56-OBOA/view';

export default function StoryPage() {
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
            <a className="story-link-card" href={STORY_MAP} target="_blank" rel="noopener noreferrer">
              <strong>Arknights Story Map <span aria-hidden="true">↗</span></strong>
              <span className="hint">Which stories lead into which, what to read first, and the community&apos;s favourites. By Joel Teo, on Canva.</span>
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
