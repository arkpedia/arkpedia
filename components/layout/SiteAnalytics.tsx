import { Analytics } from '@vercel/analytics/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { analyticsPath, createSessionSampler } from '@/lib/analytics/session';

const sampleSession = createSessionSampler();

/** Load the SDK only for sampled production sessions; unselected sessions send nothing. */
export default function SiteAnalytics() {
  const router = useRouter();
  const [sampled, setSampled] = useState(false);
  useEffect(() => setSampled(sampleSession(() => window.sessionStorage)), []);
  if (!sampled || !router.isReady) return null;
  return <Analytics route={router.pathname} path={analyticsPath(router.asPath)} />;
}
