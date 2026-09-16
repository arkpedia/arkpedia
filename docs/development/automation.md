# Automation and the free plan

Only the `arkpedia` organization repositories use this setup. The original
`kukkikaze/Arkpedia` repository is not modified.

## Cost limits

The organization is on GitHub Free. Its Actions budget was verified as **$0 with
`prevent_further_usage: true`** on 2026-09-16. Keep that organization-level budget:
it stops billable Actions usage after the included allowance is exhausted. Private
CI can stop until the allowance resets; free does not mean unlimited private runs.

- Private app: one Ubuntu job per PR update and main push, 20-minute timeout,
  one Chromium installation, desktop and phone projects in the same job. A newer
  update cancels its previous check. No uploaded build, screenshot or video artifacts.
- Private daily content preparation: one job, 20-minute timeout, one rolling PR in the public data repository; no website build.
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

The public data workflow needs **Allow GitHub Actions to create and approve pull requests** enabled. No workflow approves or merges PRs. The private preparation job uses `CONTENT_DATA_DEPLOY_KEY`, a write deploy key scoped only to `arkpedia-data`; other jobs keep read-only default permissions.

## Deployments and asset updates

[Runtime content releases](runtime-content.md) let deployed pages adopt reviewed records and media versions without rebuilding. `data/assets/revisions.json` pins images, skins, five voice repositories and community palettes to immutable commits. The daily preparation job runs `npm run assets:update`, compiles records and proposes a public data PR. Merging publishes one validated content pointer. Pages retain their release while open and adopt updates during server revalidation.

Images and audio are delivered directly from GitHub, without proxying their bodies through Vercel. The bundled fallback retains its deployment-time asset lock. Changes to application behavior or the content schema still need a deployment.

`npm run check:published-assets` verifies every indexed image path against the pinned
manifests, downloads a sample from every image category plus responsive variants,
checks their SHA-256 and sizes, and verifies pinned palette/voice metadata. Complete
image decoding/hash verification lives in the public asset repositories. Voice
syncs verify every changed clip against its upstream Git blob and decode it before
publishing; they do not delete removed/legacy recordings automatically.

## Local checks

```sh
npm ci
npm run typecheck
npm test
python3 -m pip install pillow certifi
python3 scripts/palettes/test-color-palettes.py
npm run check:assets
npm run check:published-assets
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
port 3192. CI uploads no reports; failures remain visible in the Actions log.
