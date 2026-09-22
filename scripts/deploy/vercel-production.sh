#!/usr/bin/env bash
# Build and deploy the production Build Output bundle through Vercel's archive
# transport. The prerendered site contains more entries than the direct-upload
# API accepts even though its actual payload is modest.
set -euo pipefail

VERCEL_SCOPE="${VERCEL_SCOPE:-mocchibirds}"

npx vercel build --prod --yes --scope "$VERCEL_SCOPE"
node scripts/deploy/prepare-vercel-output.mjs
npx vercel deploy --prebuilt --prod --archive=tgz --yes --scope "$VERCEL_SCOPE"
