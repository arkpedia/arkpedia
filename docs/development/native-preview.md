# Native redesign Preview

The redesign is reviewed independently of the live www / Cloudflare copy. Its
native Cloudflare Worker Preview is named `arkpedia` under the existing `arkpedia`
Worker. Publish with the manual Build and publish Cloudflare Preview workflow,
using an immutable full source SHA on the redesign branch. This does not merge the
redesign into main or change production traffic.

`wrangler.preview.jsonc` is exclusively for `wrangler preview`; never deploy it
with `wrangler deploy`. It binds `arkpedia-preview-cache`, an automatically
isolated Durable Object namespace, and no account database or production service.
The wrapper in `scripts/deploy/preview-worker.mjs` injects `ctx.exports.PreviewSelf`
for both normal requests and queued revalidation. A normal service binding would
call the live deployment from a native Preview.

The existing internal `staging` build role means noindex and analytics disabled;
it is retained for build compatibility. The user-facing environment is Preview.
Twitch/YouTube credentials are Preview secrets, maintained separately from live.
Other authentication/provider credentials are not copied.

The workflow builds on Linux without provider credentials, packages the exact
source, verifies its checksum and clean build identity, and publishes from a
separate job using the fixed native Preview command. Only focused isolation
checks are part of this demo publication; this is not a full release acceptance.
The standard production checks remain separate.

The native URL is `https://arkpedia-gins.preview.mocchibird.com`. The technical
`staging` build role is retained only for noindex/analytics compatibility.

The old controller, staging workflow/config/helpers and their dedicated tests are
removed. Live release validation uses shared provider utilities instead of
importing the retired staging adapter. Keep unreleased source on the redesign
branch when pruning superseded branches.
