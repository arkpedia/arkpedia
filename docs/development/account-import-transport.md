# Account import transport

The installation-free importer saves a successful sign-in locally by default. The reader can
check “Don’t save this sign-in on this browser” to keep it in memory for that import only.
Saved credentials include their server, so reopening the dialog selects the same region and
shows Import, Request code and Forget everything. Request code sends to the saved email on its
own server without importing or changing the saved login. Rejected saved credentials return to
email login; choosing a different server shows that server's email login. Backups exclude
sign-in credentials. Forget everything confirms the full scope, clears local/session storage,
retires active state in open tabs and reloads; it includes every account, manual progress,
playlists and preferences.
Its WebAssembly TLS session connects to the real
provider through the Wisp relay; the relay carries encrypted bytes and cannot read the requests.

| Request | Route | Reason |
| --- | --- | --- |
| Public game server list (Global, JP, KR) | Browser → `/api/account-import/network?server=…` | Public metadata is shared through a 60-second server cache and 60-second CDN cache. |
| Public game version | Browser → provider | These version hosts allow cross-origin browser reads. |
| Email code and SDK sign-in | Encrypted relay | The SDK rejects website Origins in its actual response, even where OPTIONS advertises CORS. |
| Game token, login and account sync | Encrypted relay | The game hosts do not grant the website browser access. |
| Account Center login and pull history | Encrypted relay | The API lacks browser access and uses session cookies whose Set-Cookie headers are unavailable to website JavaScript. |

The metadata API accepts only a known server id and GET, reads a fixed public URL without
credentials or redirects, validates the response, and caches no failures. Concurrent reads
for the same server share one upstream request per warm function instance. Cache layers can
make a successful response up to roughly two minutes old. Version files remain fresh browser
reads. A cache failure falls back to the original public GET through the encrypted relay;
authenticated requests never change route or replay automatically after a refusal.

Email-code requests retry once after one second only for curl DNS/connect failures (6/7),
which occur before an HTTP request can be delivered. Each attempt signs a fresh timestamp,
keeping its email, server, device and relay. HTTP errors, provider refusals, TLS failures,
timeouts and lost replies never retry automatically: the code might already have been sent.
Code requests do not follow redirects, so a later redirect-target connection failure cannot
be misclassified as a failure before delivery.
Errors distinguish a failed connection from unconfirmed delivery, and code-limit wording says
to wait at least a minute without promising that Yostar's own limit expires then.

A 60-second per-server browser cooldown starts with a code request and restarts when it
finishes, including failure. It persists across dialog reopening/reload and updates other tabs
through local storage without storing an email, code or token. Blocked storage uses memory.
This is local pacing, not provider rate-limit enforcement; simultaneous tabs can race.
Existing-code import and saved-token import remain available during the resend countdown.

The progress list describes reading game server settings. Loading public settings does not
prove that an encrypted relay connection has opened. Sending a code and verifying a code are
independent: a reader can try a code already received without requesting another email.
Both new and saved sign-ins request codes independently of game-server settings. Background
settings errors are reported when importing, rather than making a delivered email look failed.
The saved sign-in also avoids new code requests on later imports.

## Provider and capacity limits

On 2026-10-17, harmless empty-body SDK validation requests from the production browser Origin
returned `客户端参数有误:cors error` for Global, JP and KR. The same validation without a website
Origin reached normal missing-field checks. Public server-list responses also lacked CORS
permission. Preflight headers and mocked transports alone cannot establish browser support;
see [browser CORS rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) and
[Set-Cookie restrictions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

An observed Global code-delivery refusal, alongside successful delivery through the official
Account Center, establishes a difference between those routes. It does not establish whether
the limit is per account, IP, client, or a combination, nor whether an Account Center code is
accepted by the SDK. Fixture tests do not answer those provider questions.

Adding relays can spread concurrent traffic and provide another failure domain. An import
would need to stay assigned to one relay for its entire session; do not rotate routes and
replay an email-code request after the provider refuses it. Only one production relay is
currently configured. Public metadata caching reduces that relay's traffic but cannot
promise to resolve a provider's email-code quota. The relay's nginx request limiter counts
WebSocket openings, not encrypted email-code requests inside a tunnel.

## Regression coverage

Relay connections belong to active work, rather than the lifetime of an open tab.
Completing or cancelling the last import/download releases its HTTP session and
shared Wisp WebSocket after any in-flight response body finishes. Waiting for an
email code holds no connection; verification reconnects using the existing flow's
credentials. During an active download, an unused pool expires after 15 seconds
(for example while waiting for cloud work or admission). Short gaps reuse the pool;
retaining a flow alone never opens it. An unowned hidden tab also releases its idle
pool without depending on a throttled timer. Cleanup never retries an authenticated
request or replaces its result. The WASM module stays loaded for later imports.

libcurl.js 0.7.4 defers HTTP-session cleanup by one millisecond and otherwise leaves
the shared physical WebSocket open. Teardown waits for that cleanup, protects any
remaining streams, and waits for the old WebSocket close event before reconnecting:
the library's old close handler can otherwise erase the new connection's registry
entry. `test-relay-session.ts` exercises the pinned library's actual Wisp lifecycle
and deferred cleanup alongside overlapping flows, pending bodies and failures.

`test-account-import.ts`, `test-import-public-network.ts` and the desktop/mobile
`account-import.spec.ts` cover protocol routing, cache coalescing/expiry and failures,
server isolation, invalid API input, existing-code recovery and no automatic resend.
Browser account responses are fixtures; no test sends a real email or signs in to an account.

## Connection diagnostics

The browser observes libcurl.js 0.7.4's exported Wisp lifecycle methods, without reading
message packets or changing encryption, routing, retries or relay logging. A bounded report
of the last 12 relay attempts stays only in page memory; the reader can copy it from the
Connection diagnostics disclosure after a transport failure. These testing controls require
`?importDiagnostics=1` on `preview.arkpedia.net` or localhost; production never shows them.
The report is never uploaded or saved.

The allow-listed report schema contains destination categories, rounded elapsed duration,
HTTP status, numeric curl/Wisp reason codes, a relay-handshake flag and a failure leg. No
URLs, request/response bodies, headers, errors, emails, codes, tokens, device/account IDs,
IP addresses, user agent or exact timestamps are captured. Internal host/port matching lives
only for the active request and is never exported. Reload clears the report.

A socket error/closure identifies browser-to-relay loss, including failed relay admission; it
does not distinguish network, browser policy, nginx rejection or a relay outage. Explicit
Wisp upstream DNS/connect/transfer failures identify relay-to-upstream; policy/throttle codes
identify relay-policy. TLS curl codes are separate. A successful handshake alone does not
prove an upstream failure: ambiguous requests, concurrent same-destination streams, missing
events and unclassified codes remain unknown. HTTP/provider refusals are responses, not
connection failures. No diagnostic probe resends authentication or sends a real email.

Protocol reasons: https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md
Dependency integration: https://github.com/ading2210/libcurl.js (pinned 0.7.4).


## Preview stage metadata comparison

Open `https://preview.arkpedia.net/account?stageDiagnostics=1`, then Import / export.
Stage metadata test is hidden without this explicit URL option and on production hosts.
Capture next import arms one import for the selected region. It observes the existing
`readAccount` result; it never requests replays or additional game data. Reports keep
stage IDs, field names/types and numeric/boolean candidate markers only. Arbitrary
strings, nested values, credentials and raw accounts are excluded. Unknown string
markers are reported by type only, so this experiment cannot yet compare their values.

Up to three captures survive closing/reopening the dialog in the same tab. They are
never stored in browser storage or synced to an Arkpedia account, and disappear on
reload or Clear captures. Compare a baseline, an unchanged import, and one after the
reader replaces one known auto-deploy in game. Field differences are evidence to
investigate, not proof of a reliable replay revision contract.

## Optional auto-deploy sync

Import / export offers an opt-in **Include auto-deploys and save to my account** choice.
When checked, a successful Yostar import automatically starts downloads after releasing
the shared import lock. The choice survives subsequent imports within the tab; account
changes or revoked saving consent clear it. Saving the Yostar login is not required.
An unchecked import starts no replay requests; **Sync auto-deploys** remains available
after import for manual local downloads. Google/Discord sign-in and ordinary page visits
never start downloads.
The in-memory game session continues at sequence 3 after syncData. The only exposed
continuation reads `quest/getBattleReplay`, including `camp_` Annihilation stages. The [ArkPRTS client](https://github.com/ashleney/ArkPRTS/blob/master/arkprts/client.py)
uses a caller-supplied battle type; it does not define a literal `battle` route.
Normal stages use the [quest route](https://github.com/loongling/LocalArknights/blob/main/src/main/java/com/hypergryph/arknights/game/quest.java).
Failures distinguish HTTP status, bounded numeric game-result codes and missing replay
payloads without exposing provider messages or raw authenticated responses.
It cannot issue arbitrary game commands. A tab-level provider owns this capability
so closing the dialog or navigating within Arkpedia leaves an explicitly started
download running. No new session secret is saved or uploaded. Reloading, closing
the tab, account changes or browser-data resets discard the capability; import
again to resume from durable checkpoints. A compact status bar exposes Pause,
Resume and Details outside the dialog.

Queue operations hold a shared browser Web Lock with game imports and continue
through pending stages after an explicit start. Actual game downloads also retain
a local 3–4.5-second delay as a second guard; cloud-only work skips it. Pause, page exit, reset and account
changes stop further work. A response already in flight may finish, but an aborted
queue does not save/upload it. HTTP 429 honors Retry-After with at least a minute's
cooldown. Any uncertain/authentication response invalidates the game session; there
is no automatic game-request retry or relogin.

Before each actual game replay fetch, the downloader asks the same-origin
`/api/account-import/replay-permit` endpoint for admission. Production and Preview
use their own isolated database and aggregate budget. Migration 0007 provides the
atomic counter: at most one grant every 500 ms and one every 3 seconds per anonymous
browser identifier. Migration 0012 adds a bounded FIFO waiting queue. Repeated polls
renew the same place; eligible older waiters win before newcomers. A browser still
on its own cooldown does not block eligible browsers. Pause sends best-effort
cancellation without resetting the consumed-grant counter; abandoned places expire
after 10 seconds and are removed by the next admission. The queue is capped at
1,000 waiters and returns a 60-second retry when full. Old clients retain the same
shared counter, although their longer polling can let their waiting place expire.

The response gives a position and a short retry delay (500–2,000 ms, with up to
100 ms client jitter), replacing exponential waits of up to 32 seconds. Network or
server failures pause instead of bypassing coordination. Responses taking a second
or longer are treated as stale and reacquired. No game UID, stage, login secret or
replay content enters admission; browser rate counters are removed after an hour
idle by bounded cleanup. Exact-origin/body checks and account ingress guards apply.
These are precautionary application limits, not a confirmed Yostar quota or an
inspection/enforcement mechanism inside the encrypted relay. Separate devices have
distinct browser limits. Ordinary login and import traffic do not use this queue.

Cloud-only restoration, uploads and removals skip Yostar admission and its delay.
Cloud requests use separate cancellation-aware pacing below account API quotas:
700 ms between reads, 1,250 ms between writes, and 6,500 ms between removals. The
server quota remains authoritative across other tabs/devices. Game downloads stay
sequential and never upload game credentials. Existing consent, ownership,
compare-and-swap and durable local-checkpoint safeguards remain in effect.

This first scheduling change uses the existing atomic D1 coordinator; it does not
add a second traffic budget or deploy extra relay Workers. A separate coordinator
Worker can later move this workload off the account database if measured admission
latency or database contention warrants it. That migration must hand over the one
aggregate counter, preserve environment isolation and keep game credentials in the
browser. Splitting Workers alone must not multiply upstream throughput.

Apply migration 0012 to the target environment before deploying this scheduler.
It adds only the anonymous waiting table; it preserves the existing rate counter
and all account/replay data. Rolling code back leaves the unused table in place.
Do not reset the shared counter during migration or rollback.

A bounded replay document with an unsupported journal, squad/action list or
mismatched stage ID is skipped during a bulk run, so later stages can still save.
The result counts skipped records and lists their stage IDs and bounded validation
reasons. It never calls the entire archive up to date when records were skipped.
No rejected payload or new fingerprint is checkpointed/uploaded; an existing copy
is preserved, and a later explicit sync retries the stage. A single-stage refresh
stops with the requested stage and precise reason. ZIP/decompression/size errors,
private fields, transport/authentication/rate failures, storage errors and cloud
conflicts still stop the run. Each skipped stage still consumes a paced request.

IndexedDB checkpoints successful replays by server, game UID and stage. Fingerprints
use hasBattleReplay/start/completion/practice counters and state. A login-only
sample left the metadata unchanged; changing one known stage changed only that
stage's start/completion counters. These are conservative hints, not an authoritative
replay revision contract. Manual per-stage refresh is a Preview/local testing tool,
available only with `?importDiagnostics=1`. Counter changes
may fetch an unchanged replay; canonical content hashes then avoid uploading it
again (only its marker changes). Failed saves retain the old checkpoint.

The separate cloud checkbox defaults off and also requires reviewed imported-game
saving consent. The owner-checked `/api/cloud-account/auto-deploys` API stores records
outside the normal snapshot; it never calls Yostar. Matching cloud fingerprints
restore local copies before any game fetch. Conflicts stop for a fresh comparison;
older counters cannot overwrite newer cloud markers. Origin, account rate limits,
request size, per-user archive quotas, exact stage identity and credential-field
checks are enforced server-side. Existing account and Preview ingress guards cover
the nested API path. Migration 0006 adds only isolated archive/usage tables and
triggers; withdrawing gameSync or deleting the user removes their cloud replays.

Cloud mutations acknowledge their guarded write with SQL `RETURNING`, not an exact
`meta.changes === 1` check. D1 counts the quota triggers' writes too: a successful
replay save can report two changes, and consent withdrawal can report more. The
account test adapter uses per-statement `total_changes()` deltas to match this
behavior. Snapshot writes use returned rows for the same reason. Optimistic hashes,
revisions, consent predicates and transaction rollback remain the write guards.

Each browser archive and each cloud account are bounded to 32 MiB / 3,000 records,
with a 512 KB decoded per-replay cap. Zip decoding accepts only bounded
`default_entry` content, validates the requested stage and rejects credential keys.
The reader accepts ZIP64 per-entry headers even when the archive uses an ordinary
end record. It streams small compressed chunks and counts actual output bytes;
the directory's size placeholder is never used to allocate or reject a replay.
Missing files, unreadable ZIPs and genuinely oversized output have separate errors.
The ZIP64 fixture was generated independently with Python's `zipfile` and contains
only synthetic data. Real-account format confirmation is still required.
These are JSON replay records, not executable files. Browser **Forget everything**
clears this IndexedDB store as well as the existing browser stores. Standard browser
backup files do not include it; **Export auto-deploys** downloads it separately.

Tests use synthetic responses and isolated databases. The maintainer's exported
0-1 replay passed document/hash validation and the single-stage UI reported a
successful refresh with cloud saving enabled. Bulk format and special-stage
coverage remain unverified; metadata-only capture does not establish those paths.


### Preview relay hostname

Preview builds select `config/relay.json`'s `previewUrl`,
`wss://preview-relay.arkpedia.net/wisp/`. Production continues using `url`.
The custom hostname is attached to the existing `arkpedia-relay` Cloudflare Worker
(Workers custom domain ID `487858e34998f381648fd960daaea7246a749e98`), with the same
origin, destination, port and rate restrictions. It does not add a relay or move TLS
termination out of the browser. Preserve that mapping when deploying the relay.
The hostname avoids the observed intermittent DNS/IPv6-only connection failure to
the `workers.dev` endpoint. Do not substitute the old `relay.arkpedia.net`: its
upstream returned Cloudflare 526 during diagnosis.

### Saved sign-in retention

A failed import never deletes a saved Yostar login. Token-exchange, game-login,
version-file and network errors do not prove the saved credential expired. The
saved actions remain available with the actual error. Request code is explicit;
a successful request opens the code form while keeping the old saved login and
its existing save preference until a replacement import succeeds. Forget remains
an explicit removal action. Tests cover connection errors at both authentication
steps, version-file failures, retry/reload persistence and provider rejection.
