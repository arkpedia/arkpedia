import Head from 'next/head';
import Link from 'next/link';
import { COMMUNITY_CREATORS } from '@/lib/community/creators';

export default function CreatorDirectoryPage() {
  return (
    <>
      <Head><title>Creators — Arkpedia</title></Head>
      <header>
        <div className="eyebrow">Rhodes Island // Creator Directory</div>
        <Link prefetch={false} href="/community" className="hint">← Back to Community Hub</Link>
        <h1>Creators</h1>
        <p className="sub">Arknights channels followed by Arkpedia.</p>
      </header>
      <main>
        <div className="creator-directory-grid">
          {COMMUNITY_CREATORS.map((creator) => (
            <Link key={creator.id} href={`/community/creators/${creator.slug}`} className="creator-directory-card">
              <span className="creator-directory-mark" aria-hidden="true">{creator.label.slice(0, 2).toUpperCase()}</span>
              <span className="creator-directory-name">{creator.label}</span>
              <span className="creator-directory-action">View videos →</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
