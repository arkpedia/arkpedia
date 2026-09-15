import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// The home page now lives at "/" (pages/index.tsx). This just keeps
// any existing /home bookmarks or external links working.
//
// Redirecting via getStaticProps's `redirect` key (the old approach)
// isn't supported under static export (`next build` with
// `output: 'export'`, or the legacy `next export`) -- Next explicitly
// disallows redirect/notFound from getStaticProps in that mode and
// fails the export for the page entirely. A plain client-side redirect
// works fine under static export instead, since it runs in the
// browser after the static HTML has already loaded rather than
// needing server-side routing at build time.
export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <Head>
      {/* No-JS / pre-hydration fallback -- redirects immediately even
          before router.replace() above has a chance to run. */}
      <meta httpEquiv="refresh" content="0; url=/" />
    </Head>
  );
}