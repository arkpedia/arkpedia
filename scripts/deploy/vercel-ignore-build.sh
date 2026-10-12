#!/usr/bin/env bash
# Vercel uses exit 0 to SKIP compilation. Every environment is NAS/prebuilt only;
# production, dashboard redeploys and [preview] commits have no exception.
# This does not run for `vercel build` on the NAS or prebuilt uploads.
set -euo pipefail
echo "Skipping Vercel compilation: run the GitHub Deploy workflow for a NAS build."
exit 0
