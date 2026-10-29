# Vercel hosting retirement

The maintainer authorized retiring Arkpedia's Vercel hosting and rollback role on
2026-10-27. This supersedes historical requirements to retain a Vercel rollback
window in the cutover, pilot release, native Preview and simplification documents.
Domain registration/renewal and unrelated Vercel projects are separate decisions.

## Release and content ownership

Cloudflare's existing checked-main application workflow remains the only production
release owner. Native Preview retains its separate isolated publication workflow.
`config/production.json` intentionally has no Vercel deployments. The retained
legacy Deploy workflow is disabled at GitHub; even if manually enabled, its target
matrix is empty. Vercel Git deployments remain disabled in `vercel.json`.

Content publication still requires the clean canonical www build fingerprint,
channel and schema to match its generator. The sole live reader is
`arkpedia-cloudflare`; retirement does not bypass the content compatibility gate.

## Cloudflare recovery

Record the actual application/edge deployment and previous version IDs before
recovery. Disable `ARKPEDIA_PRODUCTION_RELEASES_ENABLED`, stop competing releases, and
use the exact clean checkout of the failed checked release:

```sh
node scripts/deploy/pilot-recover.mjs FULL_FAILED_SOURCE_SHA FAILED_WORKER_VERSION_UUID --local-oauth
```

The existing recovery command verifies release ownership, restores its recorded
previous application version, and verifies the restored version and public health.
If ownership differs, reconcile the live version rather than forcing recovery.
Do not restore D1, reset R2, change secrets or move content pointers for code recovery.
Subsequent user writes must survive. See the pilot release guide for details.

For an edge regression, keep the apex/www/Preview routes and custom domains in
place and restore a compatible retained `arkpedia-edge` version through Cloudflare
version deployment. Review the version's SITE binding and Preview isolation before
activation. Removing routes is no longer a Vercel fallback procedure.

Read-only provider inventory on 2026-10-27 confirmed application version
`ef4afe11-496f-4fa6-a6da-b7eaeef83abe` recorded previous version
`6c77590c-811f-49cb-9eb9-f0cc346dee4e`. Edge version
`a27216c5-5350-417e-ae69-bac8631bda30` and earlier versions were retained.
These are observation receipts, not permanent rollback targets. Refresh them before
any recovery. No deliberate production rollback was performed for retirement.

## Provider cleanup

Remove any Vercel DNS origin and the no-Worker www `.well-known` verification
exception only after confirming Cloudflare serves apex/www/Preview independently.
Preserve relay, assets, mail, certificates and domain registration/renewal. Check
all other team projects, paid add-ons and membership effects before downgrading
Vercel Pro. Preserve project settings/history unless separately authorized for deletion.

On 2026-10-27, the obsolete www `.well-known` no-Worker exception was removed.
All three application edge routes were retained. The public probe now returns
the Cloudflare/OpenNext 404 with `x-arkpedia-edge: PASS`, rather than reaching the
paused Vercel deployment. Both www and Preview continued returning 200.
