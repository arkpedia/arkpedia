import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { ContentImg } from '@/components/content/ContentImage';
import { withContentPage } from '@/lib/content/server';
import { formatDayMonthYear } from '@/lib/pulls/format';
import { UNPLACED, type StoryManga } from '@/lib/story/storyMap';

/*
 * Every official Arknights comic on the Global site, each linking to its pages there. The site's
 * own comic section is a carousel on its home page with no address of its own, so this is the
 * one place a comic can be linked to from its list. The list is the Story Map importer's
 * (scripts/imports/import_story_map.py, from the site's comic list), refreshed with the content
 * release; where each sits on the Story page's map is its `section`.
 */

interface Props {
  /** The official comics, most recently updated first. */
  manga: StoryManga[];
}

export default function MangaPage({ manga }: Props) {
  return (
    <>
      <Head><title>Arknights Manga — Arkpedia</title></Head>
      {/* Reached from the Story page's card, so the way back is to it: a crumb in the eyebrow,
          as the community pages have, and a button for it in the header. */}
      <PageHeader eyebrow={<>{'Rhodes Island // '}<Link prefetch={false} href="/story">Story</Link>{' // Manga'}</>} title="Arknights Manga"
        sub={<>Every official comic from the <a href="https://www.arknights.global/" target="_blank" rel="noopener noreferrer">Global site</a>, read there for free.</>}
        actions={<Link prefetch={false} href="/story" className="btn btn-sm ghost">← Back to Story</Link>} />
      <main>
        <section className="op-section" aria-labelledby="manga-list">
          <h2 id="manga-list">Official comics <span className="hint">{manga.length}</span></h2>
          <ul className="manga-grid">
            {manga.map((comic) => (
              <li key={comic.id} className="manga-card">
                <a className="manga-cover" href={comic.url} target="_blank" rel="noopener noreferrer" aria-label={`${comic.title}: all chapters (opens in a new tab)`}>
                  {comic.image ? <ContentImg src={`/${comic.image}`} alt="" /> : <span className="manga-cover-missing">{comic.title}</span>}
                </a>
                <div className="manga-body">
                  <p className="manga-meta hint">
                    {comic.updated && <>Updated {formatDayMonthYear(comic.updated)}</>}
                    {comic.updated && comic.chapters ? ' · ' : ''}
                    {comic.chapters ? `${comic.chapters} chapter${comic.chapters === 1 ? '' : 's'}` : ''}
                  </p>
                  <h3>{comic.title}</h3>
                  {comic.description && <p className="manga-description">{comic.description}</p>}
                  <p className="manga-place hint">On the story map: {comic.section ?? UNPLACED}</p>
                  <div className="manga-actions">
                    <a className="btn btn-sm ghost" href={comic.url} target="_blank" rel="noopener noreferrer">All chapters ↗</a>
                    {comic.latestUrl && comic.chapters && comic.chapters > 1 && (
                      <a className="btn btn-sm ghost" href={comic.latestUrl} target="_blank" rel="noopener noreferrer">Latest chapter ↗</a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /manga, and on Vercel there is no data/ to
   build it from. The builder reads only the map compiled into the bundle (a JSON import); once a
   release carries the page, the list comes from the release, so a new comic needs no deployment. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/manga', async () => {
  const { bundledStoryMap } = await import('@/lib/story/storyMapData');
  const manga = [...(bundledStoryMap().manga ?? [])].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
  return { props: { manga } };
}, { bundledWhenUnpublished: true });
