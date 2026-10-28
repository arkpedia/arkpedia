import Head from 'next/head';
import { useContentUrl } from '@/lib/content/context';
import { canonicalUrl, pageTitle } from '@/lib/seo/site';

/**
 * What a page tells a tab, a search result and a share card about itself: its title and
 * description, the address it is indexed under, and the picture a card shows.
 *
 * One component rather than a <Head> per page, so every page says the same things in the
 * same way (scripts/tests/test-page-metadata.ts asks each page for it). The tags carry keys
 * so the page's values replace pages/_app.tsx's site-wide fallbacks rather than sit beside
 * them: next/head drops a repeated <title> and <meta name>, but not a repeated
 * <meta property> or <link>, and without the keys every page shipped two og:title tags.
 *
 * Props only, nothing read from the browser or the clock, so the server's markup and the
 * first client render agree.
 */
export default function PageMeta({ title, fullTitle, description, path, image = null, noindex = false }: {
  /** The page's own name; "— Arkpedia" is added (pageTitle). */
  title: string;
  /** The whole tab title instead, for the home page, whose name is the site's. */
  fullTitle?: string;
  /** One or two plain sentences on what the page holds: the search snippet and the card's text. */
  description: string;
  /** The page's own route, encoded as the site's links encode it (operatorHref and the like): an old
   *  route name is mapped to its public name. Not written for a noindex page, nor without one
   *  (an error page). */
  path?: string;
  /** The card's picture: a published asset path (resolved against the content release) or an
   *  absolute URL. Without one the card shows the site's mark (pages/_app.tsx). */
  image?: string | null;
  /** A page search engines should not list: the account, a search, a popout. */
  noindex?: boolean;
}) {
  const contentUrl = useContentUrl();
  const tab = fullTitle ?? pageTitle(title);
  // A page that is not indexed names no canonical address either: the two would contradict.
  const url = path === undefined || noindex ? null : canonicalUrl(path);
  const picture = image ? (/^https?:\/\//.test(image) ? image : contentUrl(image)) : null;
  return (
    <Head>
      <title key="title">{tab}</title>
      <meta key="description" name="description" content={description} />
      {url && <link key="canonical" rel="canonical" href={url} />}
      <meta key="og:title" property="og:title" content={fullTitle ?? title} />
      <meta key="og:description" property="og:description" content={description} />
      {url && <meta key="og:url" property="og:url" content={url} />}
      {picture && <meta key="og:image" property="og:image" content={picture} />}
      {picture && <meta key="twitter:card" name="twitter:card" content="summary_large_image" />}
      {noindex && <meta key="robots" name="robots" content="noindex" />}
    </Head>
  );
}
