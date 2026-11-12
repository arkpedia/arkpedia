# Content and asset updates

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
