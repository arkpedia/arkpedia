#!/usr/bin/env bash
#
# Whether Vercel should build this commit. Wired up by vercel.json's ignoreCommand.
#
# THE EXIT CODES ARE INVERTED, which is the only thing about this worth remembering:
#
#   exit 0  ->  SKIP the build
#   exit 1  ->  RUN the build
#
# Vercel builds every push to every branch by default, and a build here generates a few
# thousand pages -- so a week of pushing a feature branch costs a week of full builds
# nobody looked at. 66 hours of build CPU in one billing period was mostly that.
#
# So: production builds always, and a branch builds only when asked for.
set -euo pipefail

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
MESSAGE="${VERCEL_GIT_COMMIT_MESSAGE:-}"
ENV="${VERCEL_ENV:-}"

# Production always builds. Asked of Vercel rather than compared against "main", so
# renaming the production branch cannot silently stop deployments.
if [ "$ENV" = "production" ]; then
  echo "production: building"
  exit 1
fi

# No branch attached -- a CLI or dashboard deploy. Someone asked for that by hand, so
# honour it rather than silently skipping.
if [ -z "$BRANCH" ]; then
  echo "no branch ref (manual deploy): building"
  exit 1
fi

# An escape hatch, so a branch CAN be previewed on purpose: put [preview] anywhere in
# the commit message. Without one there would be no way to see a branch deployed, which
# is a worse problem than the bill.
case "$MESSAGE" in
  *'[preview]'*)
    echo "$BRANCH: [preview] in the commit message, building"
    exit 1
    ;;
esac

echo "$BRANCH: a preview branch with no [preview] marker, skipping"
exit 0
