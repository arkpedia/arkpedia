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
- Private daily data/asset refresh: one job, 15-minute timeout, one rolling PR.
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

The daily refresh needs **Allow GitHub Actions to create and approve pull requests**
in organization and repository Actions settings. No workflow approves or merges PRs.
If the setting is disabled, the refresh still publishes its branch but reports an
error instead of pretending a review PR was opened. The organization owner enabled this permission during setup; the application
repository keeps default workflow permissions read-only and grants PR writes only
to its refresh job.

## Deployments and asset updates

`data/assets/revisions.json` pins images, skins, five voice repositories and
community palettes to immutable Git commits. The app redirects image requests to
those commits; audio templates and palette fetches resolve through the same lock.
Images/audio are still delivered from GitHub, without proxying their bodies through
Vercel. Existing deployments do not follow asset-repository `main` automatically.

Run `npm run assets:update` with GitHub CLI access to resolve current refs, update
both availability indexes, and verify published assets. It refuses removed paths
and restores the old files on validation failure. The daily refresh includes this
step and proposes updates in its existing rolling PR. Review and merge that PR to
adopt new media. Roll back the lock and both indexes together if needed.

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
npm run build
npx playwright install chromium
npm run test:browser
```

Browser checks cover operator search, planner selection, section navigation,
keyboard skill adjustments, stable skill headings, mobile overflow, pinned artwork
redirects, and voice play/pause. Audio playback uses a generated silent fixture so
browser CI is deterministic; it does not claim to verify every recording. Published
media integrity is checked separately. The suite tests the production build on
port 3192. CI uploads no reports; failures remain visible in the Actions log.
