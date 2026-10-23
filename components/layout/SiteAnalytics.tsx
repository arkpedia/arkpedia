import Script from 'next/script';
import webAnalytics from '@/config/web-analytics.json';

/**
 * Cloudflare Web Analytics on the site's Worker: visits, page views, pages, referrers and
 * countries, with no cookie and no visitor id. It is free, so every visit counts: nothing is
 * sampled, as Vercel's had to be. `spa` counts the client router's page changes, which never
 * reload the document. Mounted only in the Worker's production build (next.config.js).
 */
export default function SiteAnalytics() {
  return (
    <Script
      // As Cloudflare's own snippet loads it.
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token: webAnalytics.cloudflareToken, spa: true })}
    />
  );
}
