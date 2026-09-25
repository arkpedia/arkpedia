import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';

/**
 * A server error, in the site's own frame rather than Next's default black page.
 * Static on purpose: this is what renders when rendering itself went wrong, so it
 * must not depend on data, the content release or anything else that can fail.
 */
export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>
      <PageHeader
        eyebrow="Rhodes Island // Error 500"
        title="Something went wrong"
        sub="This page failed to load. Try again in a moment; if it keeps happening, the page is broken on our side."
      />
      <main>
        <nav className="error-page-links" aria-label="Where to go instead">
          <Link prefetch={false} href="/" className="btn primary">Home</Link>
          <Link prefetch={false} href="/operators" className="btn">Operators</Link>
        </nav>
      </main>
    </>
  );
}
