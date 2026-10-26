import { Analytics } from '@vercel/analytics/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { analyticsPath, createSessionSampler } from '@/lib/analytics/session';
import Script from 'next/script';
import webAnalytics from '@/config/web-analytics.json';

const sampleSession = createSessionSampler();

/** Load the SDK only for sampled production sessions; unselected sessions send nothing. */
function SampledVercelAnalytics() {
  const router = useRouter();
  const [sampled, setSampled] = useState(false);
  useEffect(() => setSampled(sampleSession(() => window.sessionStorage)), []);
  if (!sampled || !router.isReady) return null;
  return <Analytics route={router.pathname} path={analyticsPath(router.asPath)} />;
}

/** The build target selects its provider; staging is disabled by next.config.js. */
export default function SiteAnalytics() {
  if (process.env.ARKPEDIA_WORKER === '1') return <Script
    id="arkpedia-cloudflare-analytics"
    type="module"
    src="https://static.cloudflareinsights.com/beacon.min.js"
    strategy="afterInteractive"
    data-cf-beacon={JSON.stringify({ token: webAnalytics.cloudflareToken, spa: true })}
  />;
  return <SampledVercelAnalytics />;
}
