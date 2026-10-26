# Retired isolated staging setup

The separate `arkpedia-staging` Worker and checked-source staging-slot controller
have been superseded by [native Worker Previews](native-preview.md). Use the
native Preview workflow and `wrangler.preview.jsonc` for new review builds.

Historical controller/proof records remain in Git history before the native
Preview migration. Their old staging commands, ownership records and API token
are no longer active deployment interfaces. Production publication remains
independent; previewing a redesign does not authorize merging it into main.
