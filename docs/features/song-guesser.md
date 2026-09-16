# Music Guesser answer modes

`/games/music-guesser` accepts **all answer types** in every round, uses one unified music library, and defaults to **Enable CN off**. Older saved answer modes migrate to all answers while retaining clip-start and release choices. Answers accept English/original titles, reviewed legacy track names, individual credited artists/composers/performers, event or chapter names, stage codes, associated characters, boss names/codenames, and numbered CC shortcuts. A matching character, artist or event name is sufficient even when several recordings share it.

Music is available through the category and release checkboxes in the unified selection. Explicitly labelled instrumental versions are excluded from quiz draws, answer suggestions and selection counts; ordinary wordless background music remains eligible. This checks original and translated titles (including the source label “Instrument”) as well as EP variant metadata. There is no separate in-game/full-library selector. The game also accepts operator EP answers derived from the album's explicit Operator EP category and associated characters. “Hellagur EP” identifies the original; capitalization does not matter. Virtuosa's separate intro uses “Virtuosa EP intro”. All 194 tracks in the 116 Operator EP albums have an EP connection. Reviewed aliases such as Eblana/Necrass and Texas alter/Texas the Omertosa work too. Tracks without a reviewed event or character association still accept their title and credited artist names. The in-game associations are deliberately reviewed metadata, not a claim to cover every in-game track. Selected event-release names also count for album tracks without a reviewed in-game role; this does not invent a battle, boss or story association.

## Custom music selection

The setup places clip-start and music choices beside a Your round panel, stacked on small screens. A short explanation and expandable rules describe the accepted answers. Music selection has searchable groups for events, mini-events, main-story chapters, CC operations, character EPs, and other album releases. Search finds controls without changing the draw; Only results narrows the draw to those matches. Select/Clear all applies to all releases (or search results). Each category header has an independent checkbox that selects or clears the entire category without expanding it, even during search. The checkbox reflects all selectable releases, including a partial state; the adjacent name/count button only expands or collapses the category. Selecting nothing disables Start instead of silently choosing an unrelated song. Reset settings restores the defaults.

`selectionCatalogue.ts` projects stable group IDs, labels and release dates server-side. `selection.ts` filters the draw and answer connections together. A reused track is eligible through any selected event, but deselected/CN-only connections do not appear in suggestions or the reveal. Character EPs are individually selectable beside the other categories. A track selected through its EP can remain playable while its CN-only event connection stays hidden.

Enable CN controls in-game events, chapters and CC; EPs and unrelated releases are selected separately. Confirmed Global dates come from the event calendar, with the Global stage index covering missing older releases. Estimated, predicted, unconfirmed and invalid dates are rejected. The flag never overwrites individual exclusions. The page revalidates hourly to advance confirmed calendar release dates. As of September 7, 2026, the default in-game draw has 320 tracks; enabling CN admits all 343 before custom exclusions. Crossing is already Global: its calendar's stale estimate is overridden by the confirmed August 13 release ([official announcement listing](https://arknights.global/news), [event release record](https://arknights.wiki.gg/wiki/Crossing)).

Choices are saved on this device under `arkpedia-song-guesser-settings-v1`. Unknown group IDs and malformed settings are discarded. Storage failures leave the game usable with session choices. Initial audio preparation waits for saved settings to load; changing filters evicts any now-ineligible upcoming song from the two-song cache. Builds never download music or query external release sources.

## Coverage and sources

`lib/music-guesser/associations.ts`, `mainStory.ts` and `eventExpansion.ts` contain server-only metadata projected onto the game catalogue at build time. The reviewed in-game associations cover **343 recordings**, covering **51 regular/anniversary events**, **14 mini-events**, **Chapters 4–17**, and **CC1–CC12 / CCB1–CCB4**. The underlying library contains **897 songs**, before the quiz excludes instrumental versions. Clues use the official MSR song ID, so a video ID is optional.

After a round, **Listen to the full song** stops the clue, starts the selected track through Arkpedia's shared player, and opens `/music` in the same tab. This also works when the player has not been initialized yet. Tracks without a video ID are unavailable in the shared player and instead show an explicitly labeled **Listen on Monster Siren Records** link.

The [2026-09-08 player catalogue review](music-player-catalogue-review-2026-09-08.md) adds 47 verified recordings through the existing album, translation, artwork, credit and timed-lyric pipeline. The shared player now contains **881 tracks**; **16** still need matching complete uploads. Their MSR clues remain available.

The [complete catalogue audit](song-guesser-coverage.md) lists every covered event, role counts, sources, corrections and unavailable recordings. All 66 event/vignette albums have been audited. The explicit exclusions in `data/music-guesser-review.json` keep promotional and different-arrangement recordings out of the in-game draw. The test suite flags any future event-album song without a review disposition. Run `npm run audit:music-guesser` for the full report. Source metadata is local; builds do not scrape references or fetch audio. The projected catalogue is approximately 41 KB gzip.

Original event sources include:

- [Il Siracusano BGM](https://arknights.wiki.gg/wiki/Il_Siracusano/BGM)
- [Lone Trail BGM](https://arknights.wiki.gg/wiki/Lone_Trail/BGM)
- [What the Firelight Casts BGM](https://arknights.wiki.gg/wiki/What_the_Firelight_Casts/BGM)
- [So Long, Adele BGM](https://arknights.wiki.gg/wiki/So_Long%2C_Adele/BGM)
- [CC season and Battleplan index](https://arknights.wiki.gg/wiki/Soundtrack/BGM/Contingency_Contract), with each season's `/BGM` page identifying lobby/battle use.
- [Underdawn BGM](https://arknights.wiki.gg/wiki/Contingency_Contract_Underdawn/BGM): two battle recordings, which require a stage-theme number or actual title to distinguish.
- [Extinguished Sins BGM](https://arknights.wiki.gg/wiki/Contingency_Contract_Extinguished_Sins/BGM).
- [Arclight OST](https://arknights.wiki.gg/wiki/Contingency_Contract_Arclight/OST).
- [Necrass / Eblana](https://arknights.wiki.gg/wiki/Eblana) for the shared character identity. Banner aliases live on their event; boss-only aliases live on their track. Eblana/Necrass is a boss connection for What the Firelight Casts and a banner connection for When Elegies Are Ashes. A broad boss answer accepts any recording associated with that boss.

The in-game file identifier `m_bat_wlfmster` and the established legacy track name `Wlfmster` point to Signore dei Lupi. This title alias works even in Track Titles.

Album categories alone are insufficient evidence of in-game use. For example, unused instrumental bonus tracks, Lone Trail promotional tracks, and the Barrenland W&W promotional mix are not automatically classified as in-game music. Misty Memory (Acoustic Version) is now included after verifying its Lake Silberneherze story use.

To expand coverage, verify the exact recording's game usage, add its song ID and role, then add stage IDs and associated characters only where supported. Keep distinct arrangements and alter forms separate. `EVENT_MUSIC`, `MAIN_STORY_MUSIC` and `EVENT_EXPANSION` support multiple tracks sharing a role and per-track variants. `CC_MUSIC` stores the series and the public operation number separately. The UI derives event, mini-event, chapter and CC coverage from playable song records, so it stays current automatically. Run `npm run test:music-guesser`.

The expanded set adds Break the Ice, Guide Ahead, Lingering Echoes, Dorothy's Vision, Dossoles Holiday, Ideal City, Who is Real, Invitation to Wine, Mansfield Break, Maria Nearl, Under Tides, A Walk in the Dust, Darknights Memoir, Twilight of Wolumonde, and Hortus de Escapismo. Their `/BGM` pages are linked beside each record in `associations.ts`. Records for reused music are merged: Dependent Variables accepts both Dorothy's Vision and Lone Trail connections; Homeland/Kazdel and Extinguish accept Darknights Memoir and CC Cinder connections. A reused track still appears only once in the draw.

Additional character aliases are verified against operator story/files and the local event enemy data, including [Mountain / Anthony Simon](https://arknights.wiki.gg/wiki/Mountain/Story), [Suzuran / Lisa](https://arknights.wiki.gg/wiki/Suzuran/File), [Executor / Federico Giallo](https://arknights.wiki.gg/wiki/Executor_the_Ex_Foedere/File), and [The Gardener / Clément Dubois](https://arknights.wiki.gg/wiki/Cl%C3%A9ment_Dubois/Enemy).

The next expansion adds Near Light, Stultifera Navis, Where Vernal Winds Will Never Blow, The Great Chief Returns, Come Catastrophes or Wakes of Vultures, The Rides to Lake Silberneherze, Zwillingstürme im Herbst, Babel, Operation Originium Dust, Operation Lucent Arrowhead, Code of Brawl, and Heart of Surging Flame. [Sound of Alley](https://arknights.wiki.gg/wiki/Near_Light/Sound_of_Alley) and [Tidal Records](https://arknights.wiki.gg/wiki/Stultifera_Navis/Tidal_Records) identify Near Light and Stultifera Navis usage. The other event records link their BGM pages. The reviewed metadata identifies **ALIVE (Instrumental)** as the boss recording; the quiz now excludes that instrumental version as well, while the vocal single remains separately available.

Main-story entries link each chapter's BGM list, starting with the [general Main Theme list](https://arknights.wiki.gg/wiki/Soundtrack/BGM/Main_Theme). [Episode 07](https://arknights.wiki.gg/wiki/Episode_07/BGM) distinguishes Patriot's 7-18 theme from H7-4; [Episode 08](https://arknights.wiki.gg/wiki/Episode_08/BGM) distinguishes Talulah's phases and Mephisto's active/dormant music. [Tower Fierce](https://arknights.wiki.gg/wiki/Tower_Fierce) verifies its chapter-menu use. Aliases include [Patriot / Buldrokkas'tee](https://arknights.wiki.gg/wiki/Patriot) and [FrostNova / Yelena](https://arknights.wiki.gg/wiki/FrostNova). Boss names are cross-checked against the repository's event enemy records. Reused recordings such as The Wall Crumbles retain both Chapter 10 and Chapter 13 connections without duplicate draws.

## Matching rules

`buildAnswerIndex` creates exact normalized lookup maps once per selection/mode. It does not use substring matching to judge an answer. Punctuation, spacing and accents are ignored; contextual filler words such as “event”, “theme”, and “music” are optional. Title normalization is separate and retains version words.

- A matching title, artist or connection wins; a title/event name collision cannot reject a valid event answer.
- Shared names accept any associated recording. “So Long Adele” and “So Long Adele lobby theme” both accept the day and night lobby recordings; unrelated tracks reject them.
- Named original CC answers accept the operation name with or without `CC` / `Contingency Contract`. Battleplan shortcuts keep `CCB` distinct from `CC`.
- Main-story chapter names, numbered aliases, stages and boss names work with or without a music role.
- Search ranks exact matches, then prefixes, then substrings. Ties favour titles, characters, events/chapters, artists, then detailed role/stage connections; labels identify each result type. Ranking depends only on the query and selected catalogue, never the hidden song.
- Artist names are projected individually from artist, composer and performer credits; full credit records remain outside the game payload. Title/artist normalization preserves names; only contextual answers strip filler words.
- Historical title/event/character rule variants remain covered by compatibility tests; the current UI always uses all answers.

## Audio preparation and iPhone playback

The five clues are **1, 2, 5, 15, and 30 seconds**, all starting at the same point in a round. **Beginning** (the saved default) skips opening silence. **Middle** chooses a point in the middle half of the full track. **Random** samples the entire range from zero to track duration minus 30 seconds. Both Middle and Random leave room for the full 30-second clue. Tracks of 30 seconds or less start at the beginning. The random choice remains fixed through guesses, skips, replays, seeking and audio retries; a new round draws a new point. Middle and Random stream from the chosen position rather than downloading or decoding a whole track, and bypasses opening-only preparation. UI labels, skip progression, playback limits, and background preparation use the shared `CLIP_SECONDS` sequence.

Guesses are unlimited within every window. Wrong guesses do not change the selected length or end the round. Skip advances to the next length without adding a guess; at 30 seconds it is disabled, and only a correct answer or Give up ends the round. Each time-window button can be selected directly, including revisiting a shorter length and choosing a different length after the answer is revealed. Guess history records the selected length for each actual answer. New rounds start at one second.

The playback bar is a native, keyboard-accessible range input. Drag or click to seek within the selected clip; seeking while paused stays paused, and seeking while playing continues from that point. Pause retains the position, and Play resumes there or restarts when already at the end. Selecting a different length stops playback and resets to the same chosen starting point. Wrong guesses leave playback running. Buffered playback restarts the audio source at the seek offset for only the remaining window duration. Streamed playback seeks relative to the detected opening and retains the media-clock boundary/muting checks; seeking is disabled until that opening is known.

The selection screen prepares the first song before Start listening. After the current song finishes preparation, one upcoming song downloads and decodes while the player listens or guesses. Next song consumes that exact prepared buffer; an early tap joins the in-flight request without restarting it. The cache holds only the current and upcoming openings, releases old entries on round/selection changes, and cancels all downloads on navigation. Failed preloads retry when selected and do not affect guesses. Decoded openings remain usable after a long round; streamed fallbacks refresh their signed source URL after a minute. Playback still starts only from the player's tap. A fast next-round transition depends on background preparation finishing in time; the first visit or a slow connection can still require waiting.

Audio downloads go directly to the music CDN. Preparation first reads 1 MiB. Compressed formats retain a 2 MiB retry cap; PCM WAV uses its header's byte rate and the detected opening to request enough audio for the 30-second clue, with a 12 MiB hard cap. At 48 kHz / 24-bit stereo, a two-second opening plus the full clue needs about 8.8 MiB. If the cap cannot cover the opening and clue, preparation falls back to streaming. The header budget is read before decoding, since Firefox and Chromium detach the input buffer; no full audio copy is needed. Downloads remain bounded even if the CDN ignores Range.

Optional preparation has a separate 15-second budget. A stalled decoder or slow preload falls back to streaming instead of failing the round. Once the source is available, streaming does not wait for `loadedmetadata` to enable Play: Safari may defer loading until a gesture. The output AudioContext is created/resumed inside the Play tap; readiness does not depend on an asynchronous pre-play `suspend()` call. Seeking waits until media metadata exists.

Changing selection stops playback and aborts pending preparation. Tests cover WAV sizing, malformed headers, stalled decoding and cancellation. Browser verification includes iPhone-profile WebKit with real MSR WAV clips, withheld metadata events, and forced streaming fallback, alongside Firefox and Chromium. This is browser-engine testing, not a physical iPhone test.


### Setup and round navigation

On mobile, the selected-track count and Start listening action stay visible at the bottom of setup, including while an event list is expanded. Enable CN sits above the music categories. Starting or retrying a round brings the audio control into view without opening the software keyboard; Change selection restores the search, expanded lists and previous scroll position.

Search covers events, chapters, CC, EPs and other releases together. Old saved pool values are ignored; per-release exclusions, CN and start-position preferences are retained. Every round accepts all answer types. Music Guesser uses the Games core’s `styles/games/guesser-shared.module.css` for heading scale, primary button states, input fields, focus treatment and site-derived corner sizes. Full answer and CC explanations remain available in an expandable section during a round.

## Unlimited-guess and seeking validation

The 47-test suite covers repeated/ambiguous answers, 100 wrong guesses across the five windows without a loss, free skips through the longest window, direct/backward window selection, per-guess window history, and clamped seek offsets. Browser checks covered seven wrong guesses remaining at one second, a free skip, direct selection of 30 seconds, paused/playing seeks, pause/resume, keyboard seeking, mobile pointer dragging without horizontal overflow, and resetting/stopping at a shorter boundary. The streamed fallback was exercised with the real MSR source through a temporary test page using a cache with no decoded buffer; it was removed after verification. Physical-phone audio behaviour remains untested in this revision.


The start-position revision passes 50 tests, adding middle-excerpt bounds, short-track fallback, settings migration and stream-only cache coverage. Real MSR browser checks verified a stable 132.71-second start through seeking, shorter windows and retry, a different start for a new draw, the 30-second endpoint, and the existing silence-skipping opening path. Saved selection survives reload; both light and dark setup styles were checked.

The unified-selection revision passes 51 music tests, including migration from the old pool setting, EP-only selection, empty selection, and independent CN filtering. Browser checks verify clearing/selecting collapsed sections, the partial-selection indicator, section selection during search, disabled Start with no music, and header controls at desktop/phone widths in dark/light themes.

Removing the answer-mode selector passes 52 music tests, including migration of older saved modes to Character Connections while retaining other preferences.

Instrumental exclusion is verified against EPs, CC/non-EP tracks, the source title “Instrument”, suggestion removal and original-song preservation.

The all-answer revision adds tests for individual credits, broad shared connections, title/event collisions, invalid guesses and search ranking. The full answer catalogue with artist names stays within the 50 KB gzip budget.

The compact setup shows clip-start choices, music search/categories and the Start action directly. Obvious selection, CN and persistence explanations are removed; optional details stay in How to play. Start choices stay on one row on phones, category rows keep 44px touch targets, and the mobile Start bar remains fixed.
