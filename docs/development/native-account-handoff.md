# Mobile account handoff

The production website pairs with mobile 0.3's `ArkpediaAuth` bridge. Ordinary
browsers and older apps continue to use Better Auth's existing browser flow.
Google and Discord authenticate in the system browser, then return to the same
app document without restarting music. This uses a custom URL scheme and supports
Sideloadly signing without associated-domain entitlements.

Native code retains a random 256-bit verifier and exposes only its SHA-256 challenge.
The same-origin JSON `begin` request registers provider, mode and a validated return
path. A random server state identifies a one-use launch record (60s). The fixed
production `start` route invokes Better Auth OAuth and stores a separate random
completion ticket inside its OAuth state. Only successful provider callbacks reveal
that ticket. Error callbacks do not. A guessed/direct `complete` request with an
existing browser cookie cannot create a handoff merely by knowing the launch state.

Linking restores the app session into the auth browser using a server-only Better
Auth one-time token; the existing fresh-session requirement applies. Link,
confirmation and deletion returns must match the initiating user. A return never
submits account deletion automatically. The completion ticket expires after 10m.

Successful completion stores a 60s handoff keyed by state and challenge, then
redirects to `net.arkpedia.mobile://auth?state=…`. The callback contains no session
cookie or bearer token. Native code verifies the pending state and redeems with its
verifier, without following redirects. The server atomically consumes the handoff
and one-time token and returns Secure/HttpOnly cookies. Native code installs these
directly into the app's cookie store; JavaScript receives only the relative return
path. Incorrect proofs cannot consume the valid handoff. No credentials are logged.

POSTs require canonical Origin and JSON. Initiation is rate limited in the existing
rateLimit table. Verification records use the existing Better Auth table and expiry
cleanup; no data migration is needed. Native endpoints fail closed outside enabled
canonical production. Better Auth token generation is disabled for client requests.

Validation covers both providers' launch redirects, missing completion tickets,
wrong proof, concurrent replay, expiry, cross-origin initiation, authenticated linking,
freshness, user mismatch and HttpOnly cookie output. Browser fixtures verify cancel,
retry, same-document return and ordinary browser sign-in at desktop/phone sizes.
These are not physical-device OAuth acceptance or real provider credential tests.
