# Automation and the free plan

This covers the `arkpedia` organization repositories. The earlier `kukkikaze/Arkpedia`
repository is retired: www.arkpedia.net deploys from this repository's `main`.

## Cost limits

The organization is on GitHub Free. Its Actions budget was verified as **$0 with
`prevent_further_usage: true`** on 2026-09-16. Keep that organization-level budget:
it stops billable Actions usage after the included allowance is exhausted. Private
CI can stop until the allowance resets; free does not mean unlimited private runs.

- Since 2026-09-25 the private workflows run on a self-hosted runner while the
  `ARKPEDIA_RUNNER` variable is set, so they use none of the included minutes; see
  [ci-runner.md](ci-runner.md). The limits below apply when it is unset.
- Private app: one Ubuntu job per PR update and main push, 20-minute timeout,
  one Chromium installation, desktop and phone projects in the same job. A newer
  update cancels its previous check. No uploaded build, screenshot or video artifacts.
  A push or PR that changes only `docs/**` or Markdown files skips Check, and so
  Deploy (`config/docs-only-paths.json`; any other file runs every step).
- Private daily content preparation: one job that pushes a validated release straight to the public data repository's `main` (no pull request); no website build.
- Browser audit (the exhaustive browser suite on main): nightly at 03:17 UTC and on demand, on the
  self-hosted runner like the content jobs. It ran on hosted runners for every push to main until
  2026-10-28, about 85 minutes a run, more than the allowance could carry. It is the full-coverage
  backstop for the browser specs a PR's or main push's targeted lane leaves out
  ([ci-impact-planning.md](ci-impact-planning.md)); with five workers on the NAS (#877) it takes
  about 14 minutes.
- Check time on the NAS (2026-10-29): about 9 minutes of tests, content checks, types, lint and
  both builds, plus the browser suite: about 14 minutes when a change needs all of it, 1 to 3 when
  the targeted lane applies. A merged PR whose exact tree its PR Check passed releases without
  checking again; one merged after main moved runs Check again with the same targeted lane.
- Public assets: standard Ubuntu runners only. Image/skin/voice syncs have explicit
  timeouts, avoid artifact uploads, and run several hours after Global reset.
- Weekly grouped Dependabot PRs limit update churn. Updates still need review;
  major npm updates remain separate. No automatic merges.
- GitHub Free for organizations includes 2,000 private runner minutes/month and
  500 MB of artifact storage. The standard public runners are free. npm caches use
  the included cache allowance; the organization spending stop remains the backstop.
- Private branch protection/rulesets require a paid plan here. The API rejects
  them on this plan, so these checks provide feedback, not enforced merge protection.
  Maintainers should merge only after Check passes.

Sources: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [included usage](https://docs.github.com/en/billing/reference/product-usage-included).

The private preparation job uses `CONTENT_DATA_DEPLOY_KEY`, a write deploy key scoped only to `arkpedia-data`, to push the release to its `main` as a fast-forward; other jobs keep read-only default permissions. No workflow approves or merges pull requests. (arkpedia-data's workflow still opens a reviewed pull request for a push to its `refresh/content` branch, which needs **Allow GitHub Actions to create and approve pull requests**; the nightly release does not use it.)

## Deployments and asset updates

[Runtime content releases](runtime-content.md) let deployed pages adopt reviewed records and media versions without rebuilding. `data/assets/revisions.json` pins images, skins, five voice repositories and community palettes to immutable commits. The daily preparation job runs `npm run assets:update`, compiles records and pushes them to arkpedia-data's `main`, whose Content release workflow validates the push and moves the content pointer. Pages retain their release while open and adopt updates during server revalidation.

Images and audio are delivered directly from GitHub, without proxying their bodies through Vercel. The bundled fallback retains its deployment-time asset lock. Changes to application behavior or the content schema still need a deployment.

`npm run check:published-assets` verifies every indexed image path against the pinned
manifests, downloads a sample from every image category plus responsive variants,
checks their SHA-256 and sizes, and verifies pinned palette/voice metadata. It then
runs `scripts/audits/check-voice-clips.mjs`, which asks for every clip a legacy voice
pack offers on an operator page, and looks up every clip an outfit's voice set
(`skinVoices`, current packs only) offers in its folder's listing, one contents-API
request per folder at the pinned revision (66 folders, so it reads `GH_TOKEN`: the
unauthenticated limit is 60 an hour). It fails on any clip the pinned repository lacks
(a clip or folder the host does not answer for is asked three times first). An
operator's own current packs are not checked clip by clip: they are whole-game dumps,
covered by their revision records. That half checks
`data/operator-voice-lines.json`, which the voices stage rebuilds, so the release job's
asset-revisions stage (which runs before it) checks only the files at its new pins. The
release job's Validate step runs `npm run check:published-assets:release` instead, whose
clip check (`--quarantine`) holds back a missing or unanswerable clip rather than the
release: the line stops offering that pack and the pack becomes a published-partial
entry in `data/quarantine.json` (stage `voice-clips`). Complete
image decoding/hash verification lives in the public asset repositories. Voice
syncs verify every changed clip against its upstream Git blob and decode it before
publishing; they do not delete removed/legacy recordings automatically.

`npm run check:payload-budgets` holds what the guessers and the palette game send to
readers (their page props and lazy catalogues) to size budgets, measured on the real
catalogue (`scripts/audits/check-payload-budgets.ts`). Check fails a change that goes
over. It is not part of `npm test`, because the release job runs that suite on the
day's data and the catalogues only grow: there the same command is the
`payload-budgets` refresh stage, and a payload over budget costs only that stage, which
the daily 'Content quarantined' issue then names until the payload is trimmed or the
budget raised. The release is never held back by it.

The palette game's swatches, `data/color-palettes.json`, are the one palette catalogue:
the site reads it, the release publishes it, and the community corrections in
arkpedia-color-palette apply on top of it. The release job's `palettes` stage rebuilds it
(`scripts/palettes/build-color-palettes.py --revisions data/assets/revisions.json`) from
the Base and Elite 2 art of arkpedia-skin-assets at the commit the release pins,
downloading only art that is new or changed. Each artwork's palette comes from its review
(`data/color-palette-reviews.json`), else its feature recipe
(`data/color-palette-features.json`), else, for new art nobody has looked at yet, an
automatic palette marked `automatic`, which the game plays while the artwork stays in
`data/quarantine.json` (stage `palettes`) until someone reviews it with
`npm run palettes:review` (it reads the art from the pinned skin repository) or writes its
recipe. Art that cannot be downloaded, decoded or matched to its manifest's sha256, or
that changed since its review, keeps its previous palette or goes without one, held under
`palettes` with a reason that names only the kind of failure; the error itself is in the
stage's log, since a reason that changes by itself would make every night a new release
(`scripts/lib/quarantine.mjs` refuses one that carries a commit, an object address or a
request's error). The completeness stage holds any dated operator whose published art still has no
palette, since the game leaves such an operator out without a word.

## Local checks

```sh
npm ci
npm run typecheck
npm test
python3 -m pip install -r scripts/requirements.txt
npm run test:py
npm run check:assets
npm run check:published-assets
npm run check:payload-budgets
npm run lint -- --max-warnings 15
npm run check:styles
npm run content:export
npm run content:validate
ARKPEDIA_CONTENT_DISABLED=1 NODE_ENV=production npm run build
npx playwright install chromium
npm run test:browser
npm run test:content-runtime
```

Browser checks cover operator search, planner selection, section navigation,
keyboard skill adjustments, stable skill headings, mobile overflow, pinned artwork
redirects, and voice play/pause. Audio playback uses a generated silent fixture so
browser CI is deterministic; it does not claim to verify every recording. Published
media integrity is checked separately. The suite tests the production build on
port 3192. Every page's layout checks (headings, picture cards, page bounds, the row
census) run in one layout census, `tests/browser/layout-census.spec.ts`, which loads
each page once per theme per project and spreads them over the workers (one browser
per two CPUs, at least two and at most three, at most one per 2 GB of memory;
`PW_WORKERS=1 npm run test:browser` runs serially); see
[ui-primitives.md](ui-primitives.md#3-the-layout-census-every-per-page-check-on-one-load-testsbrowserlayout-censusspects). CI uploads no reports; failures remain visible in the Actions log.
