# Relay domains and the production alias

`arkpedia.vercel.app` is a domain of the production Vercel project `arkpedia`
in `kukkikazes-projects`. It redirects with status 308 to the canonical
`www.arkpedia.net`, the same destination as `arkpedia.net`. Vercel refuses chained
domain redirects, so the alias points directly to that destination. Domain redirects
preserve paths and query parameters and require no application build.

Manage this in Vercel's project domain settings, or PATCH
`/v9/projects/arkpedia/domains/arkpedia.vercel.app` with
`{"redirect":"www.arkpedia.net","redirectStatusCode":308}` in that team's scope.
The previous configuration had `redirect: null`. Do not redirect the dev domain
or all `*.vercel.app` hosts.

Browser storage belongs to an origin. Progress and saved sign-ins on the old
Vercel domain do not automatically move to the public domain.

The account relay's source of truth is `arkpedia/arkpedia-relay`,
`relay.config.json`. Allow `https://arkpedia.vercel.app` there as an exact origin
for existing tabs. The live installation currently predates that repository's
config-based server: its origin set is inline in `/opt/arkrelay/app/server.mjs`.
Update that set and the nginx Origin map together, validating before restarting
`arkrelay` and reloading nginx. Preserve the live sandbox, firewall, destination
allowlist, limits and logging policy.

Music streams directly from Monster Siren's CDN and no longer uses this relay.
Retire only the `arkaudio` service, its `/msr/<cid>` nginx location and its two
`arkaudio_*` limit zones after the direct-playback release is verified. Keep a
backup, validate with `nginx -t`, and reload nginx before stopping `arkaudio`.
Do not change the `/wisp/` route, the `arkrelay` service or its firewall/sandbox.
The retired audio implementation is recoverable from Git history if rollback is needed.

Verify allowed account origins upgrade to WebSocket status 101 and a foreign
origin is refused with 403. The retired `/msr/<cid>` route should return 404.
No email, code, token or imported account is needed for these checks.
