# Automatic catalogue releases

`Prepare content release` runs daily at 19:57 UTC and can be dispatched manually. The pipeline starts from the latest public `arkpedia-data/main`, imports new records, publishes any missing media, rebuilds derived data, validates the complete catalogue, and pushes the compiled release directly to data main. The existing data repository validation workflow publishes the runtime pointer. No website rebuild is needed for a content-only release.

## Sources and identity

- Obtainable CN operators and outfits come from commit-pinned game tables, joined by character ID and skin ID. Existing editorial records are preserved. New records include statistics, skills, talents, base skills, module stages and archives. CN text remains CN until an official Global equivalent is published.
- Structured upcoming/yearly wiki rows supply English event names and banner lineups. Discovery requires a matching client calendar window. Returning limited operators are imported separately from featured operators. Ordinary regional Standard/Kernel banners use the existing dedicated importer.
- A matching Global character/skin ID replaces provisional names and text. Previous operator names remain valid routes. Banner references and outfit availability keys migrate with renamed records. Official Global release windows determine release state; an EN table preload alone never confirms a release date.
- Home farming comes only from repeatable tier-three material drops in the Global stage table. Its stage validity windows are independent of an event shop's closing time. The client filters those windows continuously, including while the page remains open.
- Portraits and artwork are decoded, hashed and committed to the existing public image/artwork repositories before the release adopts their immutable revisions. Missing source art fails publication instead of rendering an empty card.

## Publication checks

The source inventory checks every obtainable CN character and outfit, discovered event/banner identities, roster references and collaboration bundles. Every operator material list (potential, promotion, skill level, mastery and module stage) must be a flat `[{ name, quantity }]` list, and a CN record without a usable release date must set `isFuture`, because the site otherwise treats it as released. Regression tests deliberately remove an entire collaboration, then check its restoration, CN-to-Global migration, returning-limited grouping, and exact farming window boundaries. Existing page-data compilation and asset checks run before publication.

Publication uses fast-forward pushes only. A concurrent data correction makes the job fail and retry from the newer main instead of overwriting it. Failed runs retain discovery reports and media plans as workflow artifacts and appear as failed GitHub Actions runs. A failed run also opens a single `Content release failing` issue in the app repository, or comments on the open one, and the next successful run closes it. After publishing, the job reads the latest scheduled run of the image, skin and voice syncs and keeps one `Asset sync failing` issue up to date; that check has a three-minute timeout and never blocks or delays a release. Source outages or unsupported source schema changes can still stop a refresh; they must never be reported as a successful up-to-date release. A daily fingerprint includes the date so wiki/art corrections are retried between game patches.

Repository-scoped `CATALOGUE_IMAGE_DEPLOY_KEY` and `CATALOGUE_SKIN_DEPLOY_KEY` can write only the two public asset repositories. `CONTENT_DATA_DEPLOY_KEY` publishes the validated data release. Application code changes continue to require their ordinary checks and draft upstream PR review.

## Local verification

```sh
node scripts/sync/sync-catalogue.mjs --dry-run
node --import tsx --test scripts/tests/test-catalogue-sync.ts scripts/tests/test-content-completeness.ts
node scripts/content/check-completeness.mjs
```

The dry run writes only `.cache/catalogue`: pinned source snapshots, a change report, and the required-media plan. A normal run writes source records. `publish-catalogue-assets.py` stages and validates media in disposable asset checkouts; its shell wrapper performs scoped publication and updates the app's asset pins.
