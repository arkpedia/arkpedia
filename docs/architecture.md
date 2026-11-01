# How Arkpedia works

Architecture reference, updated 2026-10-25. Arrows show the direction of a request,
read, publication or deployment; responses return along the same connection.
The diagrams distinguish the production Vercel site from the Cloudflare migration.

## 1. Whole system

```mermaid
flowchart TB
  reader[Reader's browser]
  local[(Browser storage: account, plans, preferences)]
  reader <--> local

  subgraph web[Website delivery]
    prod["Vercel production · main<br/>www.arkpedia.net"]
    dev["Vercel development · dev<br/>arkpedia-dev.vercel.app"]
    edge["arkpedia-edge · front cache<br/>arkpedia-cf.mocchibird.com"]
    site["arkpedia · site Worker<br/>Next.js through OpenNext"]
    cache[(Regional page cache + R2)]
    queue[Durable Object revalidation queue]
    stage["arkpedia-staging<br/>Explicit feature candidate"]
    stageCache[(Separate staging R2 cache)]
    stageQueue[Separate staging revalidation queue]
    edge -->|SITE binding: miss, refresh or bypass| site
    site <--> cache
    site --> queue
    queue -->|background regeneration| site
    stage <--> stageCache
    stage --> stageQueue
    stageQueue --> stage
  end
  reader --> prod
  reader --> dev
  reader --> edge
  reader --> stage

  pilotDb[("D1: arkpedia-accounts-dev<br/>Identity, sessions and validated cloud saves")]
  providers[Google / Discord]
  site <--> pilotDb
  reader <-->|Arkpedia sign-in redirect| providers
  site <-->|OAuth identity exchange| providers

  subgraph content[Public content and media]
    data["arkpedia-data<br/>source records + generated releases"]
    assets["Public asset repositories<br/>images, skins, voices, L2D, SD"]
  end
  prod -->|live pointer and verified release| data
  dev -->|dev-live pointer and verified release| data
  site -->|live pointer and verified release| data
  stage -->|checked candidate channel; main-based previews use live| data
  reader -->|commit-pinned media URLs| assets

  subgraph imports[Account import: encrypted tunnel]
    door["arkpedia-relay Worker<br/>origin and rate gate"]
    container[Relay container: Wisp TCP forwarding]
    game[Yostar login, game and Account Center servers]
    door --> container
    container --> game
  end
  reader -->|WSS| door

  upstream[Game tables, official announcements, art mirrors, wikis]
  jobs[GitHub Actions: import, validate, compile and publish]
  upstream --> jobs
  jobs --> data
  jobs --> assets
  app["Private arkpedia repository<br/>pages, components, logic and workflows"]
  app -->|Check then prebuilt Deploy| prod
  app -->|Check then prebuilt Deploy| dev
  app -->|successful main Check: scoped pilot release| site
  app -.->|separate existing front Worker publication| edge
  reader -->|direct audio or embedded player| music[Monster Siren CDN / YouTube]
```

The browser runs the interactive planners, games and account-import client.
The website renders pages and supplies public API responses. Game content and
media can change independently of application deployments.

## 2. Cloudflare request and cache path

```mermaid
flowchart TD
  request[Request to arkpedia-cf.mocchibird.com]
  front[arkpedia-edge: small front Worker]
  eligible{Cacheable page GET or HEAD?}
  edgecache[(Cloudflare Cache API: local data centre)]
  state{Live build and fresh copy?}
  hit[Return HIT]
  stale[Return STALE and refresh in background]
  site["SITE binding → arkpedia Worker"]
  static[ASSETS: JS, CSS and other build files]
  regional[(OpenNext regional incremental cache)]
  r2[(arkpedia-opennext-cache: shared R2)]
  render[Next.js page generation / API handler]
  data[Verified content release]
  queue[DOQueueHandler]
  request --> front --> eligible
  eligible -->|yes| edgecache --> state
  state -->|fresh| hit
  state -->|stale but usable| stale
  state -->|missing or old build| site
  stale -.->|background refresh| site
  eligible -->|no: pass through| site
  site -->|static file| static
  site -->|page cache lookup| regional
  regional -->|miss| r2
  r2 -->|missing page| render
  regional -->|expired page| queue
  queue -->|WORKER_SELF_REFERENCE| render
  site -->|API / uncached render| render
  render --> data
  render -->|new page and props| r2
  site -.->|eligible response fills front cache| edgecache
```

- **Front cache:** caches suitable 200 page HTML and `/_next/data/...` responses.
  Freshness follows the site's cache headers; stale retention is capped at one day.
  Build-manifest checks prevent cached HTML referencing removed deployment files.
- **Bypass:** `/api/*`, `/account`, static files, image optimization, non-GET/HEAD
  methods, authenticated/range/upgrade requests and preview-mode cookies. Responses
  with cookies, private/no-store/no-cache directives or an unknown build are not kept.
- **Regional incremental cache:** a separate layer inside the site Worker. It keeps
  a local copy for at least one day and refreshes from R2 in the background on hits;
  page freshness and regeneration still follow ISR rules.
- **R2:** shared generated-page/data cache; also holds cached signed Monster Siren
  audio addresses. It is not the canonical game dataset or a user-account database.
- **Durable Object:** coordinates background revalidation. The configured
  `new_sqlite_classes` migration creates Durable Object storage; it is not a D1 binding.
- **Vercel:** provides its own page/CDN/ISR delivery instead of this Worker chain.
  `arkpedia-edge` does not front the Vercel production site.

## 3. Data and asset publication

```mermaid
flowchart TD
  tables[EN and CN extracted client tables]
  editorial["arkpedia-data/editorial<br/>reviewed source corrections"]
  sources[Official announcements, wikis and media mirrors]
  sync[Public asset sync/import workflows]
  media[Image / skin / voice / L2D / SD repositories]
  prep["Private app: Prepare content release<br/>hydrate canonical source, refresh and compile"]
  gate["Tests, schema, checksums, completeness<br/>and deployed-code compatibility gate"]
  main["arkpedia-data/main<br/>source/ + release/"]
  dev["arkpedia-data/dev<br/>shared source compiled with dev app code"]
  validate[Public Content release validation]
  live["live/current.json → immutable release commit"]
  devlive["dev-live/current.json → immutable dev release"]
  www[Production page regeneration]
  previews[Dev and Cloudflare page regeneration]
  browser[Browser: one release and its media pins]
  tables --> prep
  sources --> prep
  sources --> sync --> media
  editorial -->|Editorial watcher dispatches compilation| prep
  media -->|validated manifests and immutable revision pins| prep
  prep --> gate
  gate -->|main channel| main
  gate -->|dev channel| dev
  main --> validate --> live
  dev -->|separate channel validation| devlive
  live --> www
  devlive --> previews
  www --> browser
  previews --> browser
  browser -->|raw.githubusercontent.com at pinned commits| media
```

`source/` is canonical; `release/` is compiled delivery output. The app repository's
bundled `data/` is a fallback/development snapshot. The loader verifies the pointer,
manifest and page hashes and retains the last valid release on a failed refresh.
Most content pages revalidate after 60 or 300 seconds; pointer polling, GitHub
caching and request-driven regeneration also affect visibility. An already-open
page retains its release to avoid mixing records and media versions.

Static art comes from `arkpedia-image-assets` and `arkpedia-skin-assets`; voice clips
come from the five `arkpedia-voice-*` repositories. `arkpedia-l2d-assets` supplies
animated outfit models, textures and effects; `arkpedia-sd-assets` supplies chibi
models and scenery. `arkpedia-color-palette` supplies community corrections applied
when the palette catalogue is built. L2D/SD catalogues also carry their own pinned
model references; do not assume every media type uses the same manifest schema.

The normal media path is direct GitHub raw delivery. Compatible root-relative image
paths redirect to pinned assets. Image optimization, when invoked, is a separate
site route; it is not the bulk media publication pipeline.

## 4. Account import and privacy boundary

```mermaid
sequenceDiagram
  participant B as Browser: libcurl.js + TLS/WASM
  participant W as Website API
  participant R as Wisp relay: doorman Worker + container
  participant Y as Yostar / game / Account Center
  participant L as Browser storage
  B->>W: Public server-list metadata only
  W-->>B: Cached public network configuration
  B->>R: WSS /wisp/ with permitted site Origin
  R->>Y: TCP to allowlisted host and port
  Note over B,Y: Inner TLS terminates in browser and actual game host
  B->>Y: Login, token exchange and account reads through encrypted tunnel
  Y-->>B: Account response through encrypted tunnel
  B->>L: Imported roster, plans and optionally saved sign-in state
```

The relay can observe connection metadata and forwards encrypted bytes. It does not
terminate the inner game-server TLS or read the email, login code, game tokens or
account response. The doorman Worker terminates the outer WSS connection.
Origins, destinations, ports and connection limits constrain relay access.

The relay is `arkpedia-relay.cloudflare-1ff.workers.dev/wisp/` (`config/relay.json`).
Preview uses `preview-relay.arkpedia.net/wisp/`, a custom hostname on that same Worker.
The VPS relay at `relay.arkpedia.net` was retired on 2026-10-28. A
container is needed for the game hosts that the plain Worker's TCP API cannot reach.

Storage belongs to the browser origin: www, dev and Cloudflare do not automatically
share imported accounts or plans. Public network metadata caching is separate from
authenticated account traffic. The game-import tunnel and Arkpedia sign-in are
different systems: Google/Discord sign-in does not pass through the game relay.

### Arkpedia account pilot and staging

The Cloudflare pilot now binds the EU D1 database `arkpedia-accounts-dev` to the
`arkpedia` Worker. Better Auth handles Google/Discord identity and sessions under
`/api/auth/*`; `/api/cloud-account` validates and stores supported personal data.
These endpoints return private/no-store responses and bypass the front page cache.
R2 remains a rendered-page/audio cache; it is not the account database.

Cloud saves use a closed list of supported stores and preferences. Imported game
records require explicit permission, and saved Yostar sign-in credentials are
excluded. Owner checks and revision comparisons prevent one user's writes from
replacing another user's save or silently overwriting a newer revision. Restoring
data updates the current document while retaining its music engine. See
[account implementation and acceptance](development/cloud-accounts.md).

The www/dev deployments remain browser-only. The separate staging Worker includes
the account code but has no D1 or OAuth bindings: its account APIs return 503,
sign-in controls are unavailable, and browser-local import/export continues to work.
The deployed pilot's anonymous API privacy and OAuth starts have been verified;
the maintainer's complete provider login, explicit provider linking and save roundtrip
remain acceptance work. A production account database and public-origin settings
must be chosen before promoting that feature or moving the public domain.

## 5. Code release and preserved legacy branches

```mermaid
flowchart TD
  main[main] --> feature[Short feature branch: local development]
  feature --> check[Ready PR Check: impact-selected validation]
  check -->|explicit checked-source request| preview[Isolated Cloudflare preview and actual journey checks]
  preview -->|accepted reviewed PR| merge[Merge into main]
  merge --> checkmain[Current-main Check: execution or exact-tree proof]
  checkmain --> vercel[Vercel production: prebuilt Deploy]
  checkmain --> pilot[Existing arkpedia Worker: scoped pilot release]
  vercel --> readers{Both main readers match fingerprint/channel/schema}
  pilot --> readers
  readers --> content[Main content publication may proceed]
  archive[Archived dev history] -.-> extract[Focused main-based feature PRs]
  cf[Preserved cloudflare work] -.-> disabled[Native pilot builds disabled]
  relay[arkpedia-relay/main] -->|relay build watch paths changed| relaybuild[Workers Builds: relay Worker and container]
```

Application and content releases are separate. Supported records/media can ship
through data publication; changed UI, calculations, mechanics or incompatible
schemas require an app release. Docs-only changes skip app Check/Deploy. Dev synchronization and deployment are retired; unreleased work is retained in
archive tags for individual extraction. See the retirement record in
[branch-sync.md](development/branch-sync.md). Cloudflare branch preservation and
public-domain cutover remain separate.

## 6. Related projects

```mermaid
flowchart LR
  data[arkpedia-data] -->|stage/source records| sim[arkpedia-stage-simulator]
  extra[arkpedia-stage-simulator-data] -->|simulator-only generated records| sim
  sd[arkpedia-sd-assets] -->|pinned models and scenery| sim
  sd --> desktop[arkpedia-desktop-chibis]
  sd --> website[Arkpedia website chibis]
  fork[arkpedia-stage-simulator-legacy: archived prototype] -.->|project lineage| sim
```

These are related applications and data consumers, not a dependency through which
all website requests pass. The desktop companion is a separate app with its own
settings. Its README explicitly separates it from website account import/storage.
This diagram records repository relationships, not an asserted live simulator
hosting endpoint. The organization `.github` repository owns profile/community files.

## Source map and verification limits

The first checked-main pilot release is main8ee3f3dc/version56bdbefb, with the same
clean live/schema2 fingerprint as www. Native pilot builds were disabled and drained;
the release owner preserves existing D1/cache/queue/self bindings and auth secrets.
Actual public/browser/account/provider/archive/sync checks passed. Previously unloaded
old-client navigation upgraded/reloaded the document; seamless continuity is not claimed.
The existing analytics hostname is nowarkpedia-cf.mocchibird.com with post-change
actual beacon ingestion verified. Isolated staging remains separate and unbound to
accounts; automatic preview retirement40208662442 passed. Front edge/relay
installation and DNS were not changed by this release. Base edge routing came from
8520b03a and relay source/config fromf2e2c3fb; no fresh VPS installation audit is implied.
Draft PR777 prepares optional public R2 delivery inside the existing edge Worker,
but no remote bucket/binding/pointer is active. Final cost/soak, old-client retention,
rollback rehearsal and public-domain cutover remain open; see the dated progress log.

| Area | Authoritative references |
| --- | --- |
| App routes and feature ownership | [Repository map](repository-map.md), `pages/`, `lib/` |
| Edge routing and bypass rules | [Edge Worker README](https://github.com/arkpedia/arkpedia/blob/8520b03abe6175e7069c7c06b881faa492cc22b2/workers/edge/README.md), adjacent `wrangler.jsonc` and `edge.mjs` |
| Site Worker, R2 and queue | [Production release and recovery](development/production-release.md), main root `wrangler.jsonc`, `open-next.config.ts`, `lib/cloudflare/regionalPageCache.ts` |
| Data release and recovery | [Runtime content](development/runtime-content.md), [pipelines](development/data-pipelines.md), `lib/content/server.ts`, `config/content-channels.json` |
| Asset URLs and pins | `config/asset-delivery.json`, `data/assets/revisions.json`, [data sources](development/data-sources.md), asset repository manifests |
| Account transport | `lib/account-import/relay.ts`, branch-specific `config/relay.json`, [relay repository](https://github.com/arkpedia/arkpedia-relay) |
| Arkpedia account pilot | `lib/cloud-account/`, `pages/api/auth/`, `pages/api/cloud-account.ts`, `migrations/accounts/`, [setup and acceptance](development/cloud-accounts.md) |
| Isolated feature staging | `wrangler.staging.jsonc`, `open-next.staging.config.ts`, [verified staging guide](development/cloudflare-staging.md) |
| Release orchestration | [Branch sync](development/branch-sync.md), [automation](development/automation.md), `.github/workflows/` |
| Separate applications | Organization simulator, simulator-data, desktop-chibis and SD asset repository READMEs |

Update this reference when changing domains, content channels, Worker names/bindings,
cache responsibilities, relay selection, storage ownership or repository consumers.
