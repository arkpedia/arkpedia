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
