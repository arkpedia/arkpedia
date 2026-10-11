# Player medal collections

Clicking a nonempty profile medal board opens the collection dialog on Account and
Import a Friend. Sets are shown first, including partially collected sets. The full
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
reserved placeholder. The set displays arrange individual medal icons on the game's
set color; no reconstructed or generated set banner is presented as official art.

```sh
ARKPEDIA_EN=/path/to/en-gamedata node scripts/build/build-medal-catalogue.mjs
```

The existing nightly Prepare Content workflow rebuilds `public/medal-catalogue.json`
after upstream data refresh. Source hydration retains the initial tracked catalogue
until the data repository carries it. The content exporter includes this public JSON;
the popup lazy-loads it from the page's content release and caches metadata by URL.
Only a 404 from an older release lacking the newly added file falls back to the
deployment copy. Other fetch errors display a retry action. Ownership is never cached
with metadata, so another account or friend always uses its own record.
