# Site settings

`lib/settings/siteSettings.ts` holds the site's preferences in one place. Each one is a typed key with a default, and all of them live in this browser under one versioned key, `arkpedia:settings`. It started on 2026-10-23 with the Techniques records' **Detailed Skill Description**, so that a saved account can later carry every preference.

- **One interface:** `SiteSettings` names each setting, its type and its default (`SETTINGS_DEFAULTS`). A value read from storage is checked against its type. Anything invalid or unknown falls back to the default, one setting at a time.
- **One way in and out:**
  - In React: `useSetting(key)` returns `[value, set]`. It renders the default on the server and in the first paint, so there is no hydration mismatch.
  - Outside React: `getSetting` and `setSetting`.
  - A change reaches every reader in the tab, and other tabs through the `storage` event.
- **Blocked storage:** in a private window or with refused site data, a change lasts for the visit, in memory.
- **For accounts:** `exportSettings()` returns `{ version, values }`, with only the settings the reader chose. That way a default changed later still reaches everyone who never touched it. `importSettings(blob)` takes such an object back; its valid settings win over this browser's.
- **Versions:** when a setting changes meaning, bump `SETTINGS_VERSION` and teach `migrate()` to bring older blobs forward.
- **Tests:** `scripts/tests/test-site-settings.ts`.

## Adding a setting

1. Add it to `SiteSettings`, `SETTINGS_DEFAULTS` and `VALID`.
2. Read it with `useSetting('yourKey')`.
3. If it replaces a key of its own (below), read the old key once and write it through `setSetting`. Then remove the old key's reads.

## Preferences that still keep keys of their own

Surveyed 2026-10-23 (`git grep "localStorage.getItem"`). None moved yet. Each needs its own migration from its old key and its own check, and the music settings sit inside the player's refs and tests.

| Key | What it is | Where | Proposal |
|---|---|---|---|
| `theme` | Light or dark | `pages/_document.tsx` boot script, nav toggle | **Keep for now.** Read before React to avoid a flash. Moving it means the boot script reads `arkpedia:settings`. Possible, but it is the riskiest move. |
| `arkpedia-site-server` | Global / Japan / Korea | `lib/time/siteServer.ts`, boot script | **Keep.** Read before React, and it follows the imported account. |
| `arkpediaMusicAutoplay` | Music autoplay | `lib/music/musicPlayerContext.tsx` | Move with the music settings, in one PR. |
| `musicVolume` | Music volume | same | Move with the music settings. |
| `arkpediaMusicDataSaver` | Data saver | same | Move with the music settings. |
| `musicIncludeEndfield` | Endfield songs on | `lib/music/songFilter.ts` | Move with the music settings. |
| `musicExcludeCopyrighted` | Stream-safe mode | `lib/music/songFilter.ts` | Move with the music settings. |
| `musicEndfieldNoticeDismissed` | Notice seen | `lib/music/endfieldNotice.ts` | Move with the music settings (a "seen" flag, but per reader). |
| `arkpedia.voiceVolume` | Voice line volume | `components/operators/OperatorVoiceLines.tsx` | **Low risk, next.** One reader and one writer. |
| `arkpedia:animated-art-sound` | Animated art sound | `components/skins/SkinZoomOverlay.tsx` | **Low risk, next.** |
| `arkpedia.world.country` | Community Hub country | `pages/community-hub.tsx` | **Low risk, next.** |
| `operatorsFilters` | The roster's last filters | `pages/operators/index.tsx` | Later. It is view state that the address (`?class=`) overrides. Decide whether an account should carry it. |
| `arkpedia-song-guesser-settings-v1` | Song guesser setup | `lib/music-guesser/selection.ts` | Later, with the games. |
| `arkpediaAudioRelay`, `arkpediaAudioDebug` | Audio fallback, debug panel | `lib/music/audioElement.ts`, `components/music/AudioDebugPanel.tsx` | **Never.** Diagnostics, not preferences. |

These are **data, not settings**, and stay where they are: account(s), planner state, pull and skin plans, base presets and setups, story and past-event progress, friends and music favorites. An account will sync them as data of its own.
