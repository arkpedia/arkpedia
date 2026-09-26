import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';

/**
 * Not found. Without this file Next rendered its own page: pure black with white
 * text under the site's nav, whatever the theme -- the one screen on the site that
 * ignored every token. Static (no data), so it is exported at build time and costs
 * nothing to serve.
 */
export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>
      <PageHeader
        eyebrow="Rhodes Island // Error 404"
        title="Page not found"
        sub="Nothing lives at this address. It may have moved, or the link may be mistyped."
      />
      <main>
        <nav className="error-page-links" aria-label="Where to go instead">
          <Link prefetch={false} href="/" className="btn primary">Home</Link>
          <Link prefetch={false} href="/operators" className="btn">Operators</Link>
          <Link prefetch={false} href="/schedule" className="btn">Schedule</Link>
          <Link prefetch={false} href="/stages" className="btn">Stages</Link>
        </nav>
      </main>
    </>
  );
}
