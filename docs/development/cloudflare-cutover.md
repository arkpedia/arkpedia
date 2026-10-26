# Cloudflare public-domain cutover

## Live cutover receipt, 2026-10-26

Cloudflare now serves https://www.arkpedia.net through `arkpedia-edge` and the
existing `arkpedia` application Worker. Verified clean source `20798fa1f5cc3c02c276557970b52ed6279c9b78`
matched the physical pilot and retained Vercel origin before the www proxy flip.
Main Check `40377894963` and application release `40377947617` succeeded; the
serving application version is `503aaa88-1790-409a-a952-fb6942d81da3` and edge
version is `80c6869a-ac82-466a-8985-61cfe61f1990`.
The apex redirects to www with path/query preservation;
https://preview.arkpedia.net serves the isolated redesign at source
`779b02645982048509fb7c912cb014860cc843f5`, with noindex and separate storage.

- Apex, www and Preview are proxied; wildcard, relay and mail records are unchanged.
  The underlying Vercel CNAME targets and production deployment remain available.
- SSL is Full (strict), Universal SSL is active, and Always Use HTTPS redirects
  plain HTTP to HTTPS. No certificate checks were bypassed.
- Keep the no-Worker route `www.arkpedia.net/.well-known/*` for Vercel domain
  verification while it remains the rollback host. Do not remove it on edge deploys.
- The single checked-main application owner is enabled; native application Git
  builds remain disabled. Public www uses the canonical auth origin and unchanged
  account D1, cache, queue, provider credentials and auth secret.
- Both public domains use only the Cloudflare relay. Exact-origin socket probes
  and all 14 supported TLS endpoint probes passed; forbidden destinations and
  lookalike origins were refused. No VPS relay is used by the application.
  Relay version `bc13fda0-c6a6-4cbd-9444-25251f0bf04c` contains merged relay PR10.
- Canonical pages, session/private saved-data cache controls, and Google/Discord
  sign-in initiation callbacks passed. The existing analytics site now names www;
  the beacon token is unchanged and Preview remains excluded.
- A private D1 Time Travel bookmark was captured without exporting account rows.
  Never commit it or restore it over later writes during a code rollback.

Real user Google/Discord login, restored archives, independent-profile sync,
old-tab/content compatibility, analytics ingestion and measured soak still need
acceptance. Vercel must remain online until those checks finish and retirement
is separately authorized. To roll public traffic back, remove only the www
application edge route; the retained proxied CNAME reaches Vercel. Leave the apex
redirect, Preview, mail and relay alone. The direct-origin TLS check uses canonical
www SNI against `cname.vercel-dns-016.com`, without disabling validation.

The preparation sections below are historical evidence, not current hosting
instructions. This receipt supersedes their unchecked tasks and old host state.

## Approved cutover, 2026-10-26

The maintainer authorized routing apex/www to the existing Cloudflare application
after verifying parity, adding `preview.arkpedia.net` for the isolated redesign,
and keeping Vercel available until acceptance and soak finish. Before changing
routes, www and the physical pilot both served clean source `0bb2699268ec`,
fingerprint `a84ebfea98d8e12622a1eae41b06f0c684498d20fbd423ce56776f03b1d779b8`,
and live content `5aa0a20ff0d1`. The exact pre-cutover Worker version is
`d2514887-c0c3-4575-997a-45a8eaa8483b`. Automatic pilot releases are temporarily
frozen during preparation; re-enable the single checked-main owner for the
canonical-origin release.

The edge configuration adds only apex, www and Preview routes, leaving relay,
mail and other subdomains alone. Explicit proxied Vercel DNS targets retain the
www rollback path; remove only the www Worker route to return traffic to Vercel.
The edge redirects apex to www with the existing 308/path/query behavior.
Preview is a fixed upstream alias to the existing public native Preview at
`arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev`; it remains noindex, uses its own cache,
and cannot receive forwarded account cookies or authorization headers. Native
Preview custom-domain bases otherwise add a preview-name label, so an edge alias
provides the exact requested short hostname without another application Worker.
The native custom-domain endpoint rejects Worker subrequests (Cloudflare 1053),
so this alias must use the verified native workers.dev endpoint instead.

The historical preparation and acceptance details below remain useful evidence;
they do not imply the route has already switched. Record final provider and
browser observations after the release and route changes.

Updated 2026-10-26. The owner-approved DNS handoff is complete; the application
cutover remains a reviewed candidate. Kukkikaze owns arkpedia.net. Public
nameservers are `ollie.ns.cloudflare.com` and `robert.ns.cloudflare.com`; www
still runs on Vercel.

## Prepared and observed

- Active **Free** zone `3765378b374f124c6f06cffdcd3ac01e` in the existing Cloudflare
  account `1ff51c10571eaa9934bc451e1bfdb361`. Registration remains at Vercel.
- Assigned nameservers: `ollie.ns.cloudflare.com`, `robert.ns.cloudflare.com`.
- Compared the complete Vercel DNS table and replaced six scanned web A records
  with DNS-only aliases: apex CNAME `f3b01a1bf6a83eb2.vercel-dns-017.com` (flattened
  at the apex), wildcard CNAME `cname.vercel-dns-016.com`. Retained relay A
  `94.130.78.111` and added its missing AAAA `2a01:4f8:1c1b:ac7d::1`. Retained
  the three apex issue CAA values (`pki.goog`, `sectigo.com`, `letsencrypt.org`)
  and the `_domainconnect.vercel-dns.com` helper. All service records have TTL 60;
  the helper retains Auto. No pre-existing mail records were present.
- Both assigned nameservers returned the prepared records before handoff.
  Public DNS confirmed the new delegation at 15:50 UTC; Cloudflare then displayed
  its activated-domain overview. No parent DS record was present.
- Current apex redirects to `https://www.arkpedia.net/` with HTTP 308.
- Existing application Worker `arkpedia`, front Worker `arkpedia-edge`, cache
  `arkpedia-opennext-cache`, queue `e4eebd64c01f4b36be846adc609deeed` and account D1
  `f7daff77-8e8f-4ec2-998b-97fb6e4b948f` retained. No account rows read or copied.
- D1 reports the production storage backend. Preserve the existing database and
  `BETTER_AUTH_SECRET`; the database's historical `-dev` name does not mean it is
  disposable. No schema migration is needed for a hostname change.
- The pilot's approved Twitch/YouTube secret update kept the exact checked script
  etag but replaced its ownership annotation. The release validator now recognizes
  only that recorded immutable version/hash and requires the media bindings on new
  releases. See [pilot releases](cloudflare-pilot-release.md).
- Native Preview stays separate and noindex at
  `https://arkpedia-gins.preview.mocchibird.com`. Its redesign is not promoted to www.

Local sanitized observations are in `.cache/migration-{release-status,provider-inventory,
secret-provenance,binding-inventory}.json`. They contain no credential values or
account records. Refresh observations before the maintenance window.

## Kukkikaze's DNS handoff — before changing nameservers

1. Export the **complete** current DNS record list from Vercel/the current DNS
   account, including custom subdomains, mail and verification records. Compare it
   with the pending zone; resolve omissions and replace scanned/flattened web IPs
   with the exact Vercel-recommended DNS records. Public resolver answers vary by
   location and are not authoritative configuration or sufficient rollback proof.
2. Keep web records pointed at Vercel and DNS-only for the DNS-management move.
   Preserve relay, mail, CAA and unrelated subdomains. Do not enable a wildcard
   application Worker route. Check any existing DNSSEC/DS configuration with the
   owner and use the provider's supported handoff; do not blindly toggle it.
3. After the owner approves the complete record comparison, change nameservers to
   the two assigned Cloudflare nameservers. Keep domain registration/ownership
   where it is; no registrar transfer is necessary. Do not change nameservers
   merely because this preparation document exists.
4. Wait for zone activation and verify DNS, www, apex redirect, certificates,
   relay WebSocket and any configured mail independently. The site still runs on
   Vercel at this stage. This separates a DNS handoff from an application cutover.

## Application candidate — before routing www to Workers

The [canonical-origin candidate](cutover/canonical-origin.patch) prepares the
auth-origin transition and tests. The [edge-route candidate](cutover/edge-route.patch)
adds **only** `www.arkpedia.net/*`, keeping the pilot route and SITE service binding.
The [apex redirect rule](cutover/apex-redirect.json) prepares the existing 308
redirect at Cloudflare, preserving paths and queries. Append it to the zone's
`http_request_dynamic_redirect` ruleset after reviewing existing rules; do not
replace an entire ruleset with this one rule. It is not installed or enabled yet.
They are unapplied patches for review, not alternate active deployment configs.
Use a clean current-main feature branch, refresh/check each patch, inspect the
resulting diff and run the existing pilot suites before the checked release.
Refresh the origin-compatibility list with the **exact currently serving checked
pre-cutover version** at that time. It currently pins the observed historical
versions; a newer repaired pilot version will correctly refuse preflight until
its identity is reviewed and included. Do not replace the list with a wildcard.

```sh
git apply --check docs/development/cutover/canonical-origin.patch
# Apply only in the approved cutover branch/window, not during DNS preparation.
git apply docs/development/cutover/canonical-origin.patch
node --test scripts/tests/test-cloudflare-pilot.mjs scripts/tests/test-pilot-release-provider.mjs scripts/tests/test-pilot-release.mjs scripts/tests/test-pilot-release-gate.mjs
```

The production auth origin becomes `https://www.arkpedia.net`. The release adapter
still observes the physical Worker through the noindex pilot hostname, allowing
pre-route health checks, and accepts the old origin only for recorded immutable
pre-cutover versions. Keep every database/cache/queue/secret identity unchanged.
Changing auth origin makes canonical www the login destination: perform this in
the coordinated maintenance window, since pilot-host sign-in will need canonical
www. Existing pilot cookies cannot become www cookies; users sign in again and
restore the same existing account rather than getting replacement identities.

Before that release:

- Add both exact provider callbacks to the existing Google and Discord apps:
  `https://www.arkpedia.net/api/auth/callback/google` and
  `https://www.arkpedia.net/api/auth/callback/discord`. Add www as an authorized
  JavaScript origin where the provider requires it. Both callbacks were saved in
  the existing provider apps on 2026-10-26 and verified after reloading. Pilot
  callbacks and credentials were retained. Google JavaScript origins remain empty
  because the application uses server-side OAuth. Canonical end-to-end login still
  needs verification after the separately authorized application cutover.
- Align the existing Cloudflare analytics site's hostname with www and verify
  ingestion after cutover; do not create a second beacon. Preview stays excluded.
- Use only `wss://arkpedia-relay.cloudflare-1ff.workers.dev/wisp/` on www and
  Preview. The approved relay origins include both exact public domains. There is
  no hostname/query fallback to the VPS; server retirement remains separate.
- Capture the actual Vercel deployment URL/ID, complete DNS values, serving Worker
  and edge versions, successful Check and release receipt. Take a fresh D1 Time
  Travel bookmark privately immediately before cutover; never put it or a database
  export in Git or CI artifacts. Code rollback must preserve subsequent writes.
- Get the current checked source onto the pilot and verify representative pages,
  images/voices/animation, Twitch/YouTube/music, planner edits, story/map progress,
  imports and independent authenticated restore/sync. Include old-client navigation,
  data-only publication and a measured soak, not just initial HTTP responses.

## Coordinated cutover and rollback

1. Keep Vercel attached to www, its certificate valid and its deployment available.
   Agree the operator, window and rollback window with kukkikaze. Freeze unrelated
   main changes during the operation and record the exact current state again.
2. Complete the reviewed canonical-origin release and its physical-pilot health
   checks. On the active zone, enable proxying for www's verified Vercel DNS record.
   Wait for Universal SSL readiness with strict origin TLS. With no www Worker
   route yet, requests still go to Vercel; verify that before proceeding.
3. Review/apply the edge-route patch and publish `arkpedia-edge` through one explicit
   owner from the checked source. This is the actual traffic switch. Route matching
   keeps other subdomains out of the application; the SITE binding reaches arkpedia.
   Install the reviewed apex redirect with the apex proxied and its certificate
   ready, so that redirect no longer depends on Vercel. It keeps the same canonical
   target and remains valid if www is rolled back to Vercel.
4. Verify the real canonical hostname: exact build, `x-arkpedia-edge` behavior,
   indexable www/SEO/canonicals/sitemap, noindex alternate hosts, unchanged 308 apex
   redirect, uncached account APIs, OAuth, restored archive multiplicity and fresh
   independent-profile sync. Check desktop/mobile and both themes. Run
   `npm run release:status`; HTTP 200 alone does not establish cutover acceptance.
5. If acceptance fails, remove **only the newly added www edge route**. The retained
   proxied Vercel record sends requests back to Vercel on the same hostname. Verify
   the restored build and user data. Keep the pilot edge route and relay unchanged.
   Use the recorded receipt/owner-aware Worker code recovery if needed; do not
   restore D1 over later user writes or delete the pending/active zone as a rollback.
6. Keep the Vercel target and automatic release path until the agreed rollback
   window and measured acceptance finish. Only then separately review retirement
   of its deploy owner, target/content-reader configuration and provider resources.

## Remaining acceptance

- [x] Complete DNS table compared and owner-approved; zone activated.
- [x] Exact canonical-host OAuth callback allowlists saved and verified.
- [ ] Repaired checked-main pilot publication and www/pilot source parity verified.
- [ ] Canonical-origin/edge patches refreshed, reviewed and checked on final source.
- [ ] Fresh private recovery baseline and public-domain rollback rehearsal recorded.
- [ ] Representative parity, account/old-client/content acceptance and soak complete.
- [ ] Explicit public-domain cutover authorized; Vercel retirement remains separate.

## Follow-on email setup

The maintainer approved Cloudflare Email Routing for `jungermin@arkpedia.net`
only; the previously discussed kukkikaze alias is deferred. Its destination inbox
was supplied privately and must stay out of Git and public artifacts. No mail
records existed before the DNS handoff. Routing is activated, its MX/SPF/DKIM
records resolve publicly, and the exact alias rule is saved with catch-all disabled.
Destination verification is pending; a verification email was requested. Verify
the destination and test delivery before claiming the alias works end to end.
Forwarding does not provide an outgoing mailbox.

## DNS handoff acceptance, 2026-10-26

- HTTPS www still serves clean Vercel source `f0a707aa3f63`; Reward Tracker and
  Schedule return 200. The deployed Reward Tracker's presentation toggle works
  in the browser and returns to the normal view.
- Apex returns 308 to www, preserving `/schedule?migration-check=1`.
- Existing VPS relay accepts a WebSocket from origin `https://www.arkpedia.net`.
- Pilot anonymous session response is 200, `no-store`, `noindex`, with no session.
- Native Preview remains separate at clean source `1cb4fad8be43`.
- Read-only release-status confirms healthy www and pilot. Pilot still serves
  older source `8ee3f3dc7852`; repaired checked-main publication and source parity
  remain open. The retained legacy dev target is 117 commits behind main.
- No application Worker route, auth origin, credentials or account database was
  changed during this DNS handoff. Canonical account login, independent sync,
  old-client/content acceptance, recovery baseline and measured soak remain
  application-cutover gates, not completed claims from this DNS check.

References: [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Redirect settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
