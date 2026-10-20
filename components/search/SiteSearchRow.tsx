import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { SITE_SEARCH_KIND_LABEL, siteSearchIcon, siteSearchLabel, siteSearchOffSite, type SiteSearchEntry } from '@/lib/search/siteSearch';

/**
 * One site search result: its art, its name with a second line under it, and what kind
 * of thing it is. The nav's suggestion list and the /search page draw the same row. A
 * YouTube or Twitch row opens in a new tab, and its kind carries the ↗ the community page's
 * links out carry.
 */
export default function SiteSearchRow({ entry }: { entry: SiteSearchEntry }) {
  const art = entry.kind === 'operator'
    ? getOperatorIconPath({ name: entry.title, rarity: entry.rarity ?? null, portraitPending: entry.portraitPending })
    : siteSearchIcon(entry);
  return (
    <>
      {art
        ? <Image className="site-search-art" src={art} alt="" width={32} height={32} />
        : <span className="site-search-art site-search-art-blank" aria-hidden="true" />}
      <span className="site-search-text">
        <span className="site-search-title">{siteSearchLabel(entry)}</span>
        {entry.sub && <span className="site-search-sub">{entry.sub}</span>}
      </span>
      <span className="site-search-kind">{SITE_SEARCH_KIND_LABEL[entry.kind]}{siteSearchOffSite(entry) && ' ↗'}</span>
    </>
  );
}
