# Official event artwork

Include official artwork wherever a source exists: event posters, banners, reward icons,
login gifts, selector tickets, purchasable packs and furniture sets. Use the actual game
or announcement image and preserve its composition and aspect ratio. Record provenance
when importing it into the asset repository.

Join artwork to stable game IDs where available. Prefer published Global artwork and
keep the original CN files available. If artwork is unavailable, keep the text usable;
retry missing art through the content pipeline when its source can be discovered.

Furniture shop thumbnails are imported automatically by
`scripts/imports/import-furniture-art.mjs`, after event rewards are generated. The
nightly staged-art publisher publishes them to `content-art/` and reruns the importer.
`lib/events/furnitureArt.mjs` selects the published regional image, including for
inherited reruns and content released before explicit theme IDs were added.

Pack artwork still uses `config/event-pack-art.json`; new packs require a sourced entry
until their artwork discovery is automated. Official livestream crops should retain
their source and region. Selector operator clicks should keep the event context open.

Permanent Reclamation Algorithm launches are imported by `scripts/sync/sync-ra-releases.mjs`
from each region's `sandbox_perm_table.json`, matched by `topicId`. They use `modeId`
and regional `releaseDate` fields in the event records, without an invented closing
window. The schedule shows a one-day launch marker. Global dates absent from the
client receive the existing CN-to-Global forecast with an explicit estimate label.
`config/ra-releases.json` supplies reviewed translations and published official art
for CN-only themes; new unmapped themes still appear under their client name.
Relaunch Anchor currently uses its official OST cover while release key art is not
in the published asset catalogue.
