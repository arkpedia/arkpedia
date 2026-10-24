# Isolated Cloudflare staging proof

Migration work uses `wrangler.staging.jsonc` and the explicit helper
`node scripts/deploy/cloudflare-staging.mjs check|build|deploy`.

The staging Worker is `arkpedia-staging`, with cache bucket
`arkpedia-staging-cache` and a self-reference to itself. It has its own Durable
Object namespace and no custom-domain routes or database binding. It reads the
existing `dev-live` content pointer without publishing to it. This is a staging
environment deployed from a feature branch, not another permanent Git branch.

The helper rejects production resources and unknown config fields. Build and deploy
both set the content channel explicitly; environment-specific values must not be
inferred from the local branch name. The dev content channel emits noindex headers.
The dedicated staging host does not exercise the production front edge Worker.

The first proof builds on the existing Linux NAS, since the Windows OpenNext build
failed the deployment-trace audit. Keep that audit; do not bypass it. The temporary
`Build Cloudflare staging` workflow creates a one-day private artifact and deploys
nothing. It needs no provider credentials. Review the build commit and config before
using local Wrangler OAuth to deploy the downloaded `.open-next` output. Do not run
plain `wrangler deploy` at the repository root: that selects the production config.

Account import needs its exact staging origin added to the relay's reviewed origin
list. A functioning page or public server-list API does not prove authenticated
imports work. Do not broaden relay origins to arbitrary workers.dev hosts.

Proof acceptance: static assets, representative rendered pages, noindex, expected
build identity/channel, ISR and revalidation confined to staging, content-only updates,
and the affected browser journeys. The staging environment does not yet include
unreleased cloud-account/D1 work being developed separately.

This is the first migration proof. After it passes, decide whether native Worker
Previews can replace this explicit staging Worker without losing self-call/resource
isolation. The current production branch/deployment chain remains unchanged until
that decision and the code-consolidation milestones are implemented.
