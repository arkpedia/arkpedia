# Vercel cost controls

Web Analytics loads only for `VERCEL=1`, `VERCEL_ENV=production`, and the `live` content channel. The dev project also uses a production deployment environment, so the channel check is required.

On the `cloudflare` branch the site's Worker uses Cloudflare Web Analytics instead, unsampled (docs/development/cloudflare-workers.md).

`SiteAnalytics` samples 20% of browser tab sessions before mounting the SDK. A versioned boolean in sessionStorage retains the decision through navigation/reloads; no visitor identifier is stored. Storage refusal falls back to a single in-memory decision. Dashboard totals are sampled observations, not exact site totals: Vercel does not automatically multiply them by five. Compare periods using the same sample rate. Path navigation is counted; filter/query/hash interactions are not extra page views. Existing Forget everything clears the sample with other browser data.

Clock pages default to 300-second ISR instead of 60 seconds. Their hydration clock and browser mount/tick/focus updates are unchanged; this avoids rewriting large HTML and JSON payloads every minute solely for a new SSR timestamp. Explicit live-feed intervals remain unchanged, as do 60-second detail-page discovery and one-second runtime fixtures. `RELEASE_REFRESH_ROUTES` derives from the existing clock route registry. Publication waits for pointer propagation, then refreshes these pages in batches of three. A failed refresh preserves existing pages and is reported by the endpoint/workflow.

Application builds already run on the configured GitHub runner and deploy prebuilt output. Vercel can still bill upload/post-build processing CPU minutes. Production project settings should use Standard build hardware and queue on-demand builds; the Vercel dashboard owns those settings. Do not enable independent Git builds. Check the next deployment succeeds and inspect billable CPU minutes before estimating savings. Paid Observability project inclusion controls require a team owner; changing that setting does not belong in application source.
