#!/usr/bin/env bash
# Production artifacts are built only by the NAS Deploy job, never this machine.
set -euo pipefail
branch="${DEPLOY_BRANCH:-$(git branch --show-current)}"
case "$branch" in
  main|dev) ;;
  *) echo "Choose DEPLOY_BRANCH=main or DEPLOY_BRANCH=dev to deploy the remote branch." >&2; exit 1 ;;
esac
gh workflow run deploy.yml --repo arkpedia/arkpedia --ref "$branch"
echo "Queued the NAS Deploy workflow for remote $branch. Follow it in GitHub Actions."
