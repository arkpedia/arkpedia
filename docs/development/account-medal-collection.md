# Player medal collections

Clicking a nonempty profile medal board opens the collection dialog on Account and
Import a Friend. Profiles with no displayed medals or no medal panel have a separate
View medals button, which opens the same collection. Sets are shown first, including partially collected sets. The full
medal list supports search, category and ownership filters. Set medal lists stay in
the same dialog.

`profile.medals` remains the display board. `profile.medalCollection` is an optional
array of `{ id, obtainedAt }`, kept in the account JSON and the friend file's explicit
profile whitelist. It never writes a friend's collection to the own-account store.
Existing version-1 files remain compatible. Absence of the collection field means
a legacy import: only the displayed medals are known, acquisition dates are unknown,
and the Unobtained filter is disabled. Re-importing from the game supplies the collection.

The game sync `user.medal.medals` includes unearned progress records too. Ownership
requires a positive finite `fts` timestamp, or a positive `rts` when `fts` is absent
or nonpositive. Timestamp values are Unix seconds. A trimmed variant fulfils its base
medal's set membership. A set completion date is derived from the latest required
medal date, and is omitted if any required date is unknown.

The catalogue is built from the EN client's `medal_table.json`, with set membership,
names, descriptions, requirements and category labels from that table. Official icons
are used only when published in the pinned external asset index; missing art has a
reserved placeholder. Set displays use the Global client's exact `_medalPosList` coordinates
and canvas dimensions, read from `ui/medal/[uc]groupframe.ab`. The sprite packs supply
each icon's native crop size and offset, including larger completion medals. The
background includes the official event art, logo, and empty medal silhouettes.

`arkpedia-image-assets/scripts/sync_profile_art.py` imports every EN set background
from `assets/dyn/arts/ui/medal/suitbkg/`, converts it to WebP, and records its source
blob and image metadata. The initial catalogue pins these new images to their asset
commit; subsequent nightly catalogues use the usual published asset index once it
includes them. Older catalogues without geometry still use the previous icon grid.

The layout importer and the catalogue build run in arkpedia-data's nightly import
(`importer/scripts/imports/import-medal-layouts.py`,
`importer/scripts/build/build-medal-catalogue.mjs`; its `docs/importer.md`).
`public/medal-catalogue.json` is rebuilt there after the upstream tables and the
medal layout importer, and arrives with the imported records. Bundle md5s are
retained in `data/medal-set-layouts.json`, so unchanged bundles are not downloaded. A
failed layout import leaves the previous geometry intact. Source hydration retains the initial tracked catalogue
until the data repository carries it. The content exporter includes this public JSON;
the popup lazy-loads it from the page's content release and caches metadata by URL.
Only a 404 from an older release lacking the newly added file falls back to the
deployment copy. Other fetch errors display a retry action. Ownership is never cached
with metadata, so another account or friend always uses its own record.

The own Account profile uses the same operator and outfit dialog as Import a Friend.
Its collection reads the selected own account's `operatorBuilds` snapshot. Legacy
records may use the planner roster only if that server was imported most recently;
friend storage is never used. Nested operator previews and outfit details keep the
parent dialog open and restore its focus/scroll on return.
