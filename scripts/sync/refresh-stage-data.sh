#!/usr/bin/env bash
#
# The steps of the content refresh that stay in this repository: the EN game tables, which the
# pull planner's sources read, and the story chapters and covers, whose source
# (arknights.timo.beer) refuses GitHub's runners, so arkpedia-data's import cannot read it. Every
# other stage of the stage data is imported there (its importer/scripts/sync/refresh-stage-data.sh,
# docs/importer.md), and arrives with its imports branch.
#
# Everything upstream is pulled into .cache/upstream/ as partial, shallow, sparse checkouts, at
# the commit pinned for its repository (scripts/lib/upstream.sh). Point a step at a local checkout
# instead with ARKPEDIA_EN.
#
# Each step is a stage (scripts/content/run-stage.mjs). A step that fails has what it changed
# under data/ and public/ put back, and every other step still runs; data/stage-report.json says
# what happened. Run on its own, the refresh first pins one commit per upstream mirror and settles
# where the CN tables come from, and exits non-zero at the end if any step failed. Inside the
# daily release (ARKPEDIA_STAGE_RUN=1) its stages join that run, which did both already and
# decides what fails the release.
set -euo pipefail
cd "$(dirname "$0")/../.."

stage() { node scripts/content/run-stage.mjs run "$@"; }
standalone=
if [ -z "${ARKPEDIA_STAGE_RUN:-}" ]; then
  standalone=1
  node scripts/content/run-stage.mjs begin
  stage pin-upstream -- node scripts/content/pin-upstream.mjs
  # The CN tables, every one from the same mirror at one commit, with a fallback mirror
  # (scripts/content/cn-tables.mjs). The daily release runs this first.
  stage upstream-cn --invariant --timeout-minutes 30 -- node scripts/content/cn-tables.mjs
fi

# EN gamedata: excel/ for the tables the pull sources and first clears read.
stage upstream-en --invariant --timeout-minutes 20 -- bash scripts/lib/upstream.sh \
  en-gamedata https://github.com/ArknightsAssets/ArknightsGamedata.git default \
  en/gamedata/excel

# Each of the Story Map's chapters, section by section, as Timo's story reader numbers them, for
# the Story page's complete library and chapter popups: read from the reader's catalogue as data,
# independently of the map, so a failed canvas import cannot block new stories.
stage story-chapters -- node scripts/imports/import-story-chapters.mjs
# Reader cover images, staged under .cache/story-covers/ for the staged-art stage (the daily
# release's), so an art-source outage cannot discard stories.
stage story-covers -- node scripts/imports/import-story-covers.mjs

if [ -n "$standalone" ]; then node scripts/content/run-stage.mjs end --strict; fi
