# Versioned account preferences

`lib/settings/siteSettings.ts` validates the versioned `arkpedia:settings` storage
contract. The accepted Cloudflare pilot can save `techniqueDetail`; main preserves
that value through backup/sync without promoting the deferred Techniques interface.
Unknown or invalid values are discarded and defaults remain implicit until chosen.

`parseSettings` is the cloud-data boundary. The store also supplies `getSetting`,
`setSetting`, `exportSettings`, `importSettings` and `createSettingsStore` for tested
storage behavior. Refused storage retains a change in memory for the current visit.
Preview audio controls use `useSiteSetting`; it preserves the same validated store contract.

Theme, site server and music preferences retain their existing keys and validation.
Do not migrate their storage as part of adding an unrelated setting: theme/server
are read before React and music restore must preserve its playing engine.

When a value changes meaning, bump `SETTINGS_VERSION` and implement migration with
compatibility tests in `scripts/tests/test-site-settings.ts`. Never drop a pilot
setting merely because main does not yet expose its control.

## Preview audio preferences

Preview adds independent `backgroundMusic` and `eventMusic` booleans (both false).
Version 2 migrates an explicitly chosen version-1 `backgroundMusic` value to both
options, preserving the old combined behavior. Subsequent changes stay independent.
`useSiteSetting` subscribes to this store, including same-tab changes and cloud restores. These preferences use personal-save
consent; it does not enable analytics or external media.

The first-visit music-playback card offers unchecked Background Music and Event Music
checkboxes, each with shared help. Analytics follows after that choice. `externalMediaChosen`
distinguishes an explicit refusal from old privacy records that only chose
analytics; an existing media opt-in remains valid. Choices remain available on
`/cookies` and autoplay is also in Account settings → Audio. Manual playback can
request media permission again after a refusal. Nothing plays before media consent.
Operator greetings and their API were removed; legacy greeting values are discarded
by settings parsing, export and cloud-data validation.

Background Music plays the chosen browsing theme outside event pages and Music Guesser.
Event Music independently enables event lobby themes, including when Background Music
is off. Event pages stay silent when Event Music is off; they do not inherit the browsing
theme. Both switches are available directly in header Settings, Account settings → Audio,
and privacy choices. Media consent and personal-player priority apply to both.

Background playback belongs to the page that requested it. A separate page-owned engine uses
reviewed lobby associations projected into the event page's `page-music` release
table. Calendar tags and reruns resolve to the original event. Unknown events stay
silent. The homepage uses the default Vision theme, m_sys_void / 生命流 (MSR 232202),
identified by the [interface BGM reference](https://arknights.wiki.gg/wiki/Soundtrack/BGM/Interface).

Page music loops by itself at no more than 15% of the player volume scale, without
changing the stored volume, queue, shuffle or repeat settings. Leaving, disabling
the corresponding music option, or cancelling a pending page request stops it. Explicit player
playback silences the page theme immediately. A paused main player allows the page
theme to play, preserving its song, queue and position. No control is rendered on the page itself.
Blocked playback offers Play background music inside Settings. Page playback never expands the mini player or writes a main-player resume request.
A browser refusal offers Play; it never opens the external-media prompt by itself.
Phones that ignore element volume still use their hardware volume.

Page themes prefer existing YouTube uploads; MSR-only tracks keep their audio
source. Ordinary manual music retains its existing delivery preference. No video
or audio is copied or self-hosted. Event associations include reviewed CC lobbies
and are independent of Global release dates. The two Monster Hunter events use reviewed YouTube-only recordings supplied by
`crossoverPageMusic.ts`, merged without duplicate IDs into older catalogues. Their
copyright flag keeps stream-safe mode effective. Other missing recordings remain silent.

Verification: `test-page-audio.ts`, `test-site-settings.ts`, `page-audio.spec.ts`,
plus the existing music resume, data-saver and playback-truth browser checks.


## Choosing background music

Settings → Choose Background Music opens the browsing-theme picker. `menuMusicSource` is `default`, `account` or `custom`; `menuMusicTrack` is a catalogue track ID (YouTube ID or `msr:<cid>`). Both use the validated personal-settings store and its existing opt-in cloud path. Background Music and external-media consent are still required. A deliberate custom Endfield choice applies only to the background engine, independently of the main player's Endfield filter; stream-safe exclusions still apply. Event details use their own independent Event Music preference and personal playback takes priority.

The import retains only `background.selected` as `AccountRecord.homeBackground`, validated as a bounded game identifier. Older imports and unavailable recordings fall back to the default with visible feedback. It never requests a game login or refresh by itself. This field follows the existing imported-data consent category.

`lib/music/menuThemeRecordings.json` is a reviewed snapshot joined from the game's `display_meta_table.json` (`homeBackgroundData.homeBgDataList[].multiFormList[].bgMusicId`) and `audio_data.json` (musics → bankAlias → bgmBanks) to exact PRTS music filenames and published MSR links, reviewed 2026-11-02. Sources: https://github.com/Kengxxiao/ArknightsGameData/tree/master/zh_CN/gamedata/excel and https://prts.wiki/w/音乐鉴赏/游戏内音乐一览. The account shape is also represented in https://github.com/pfyy/OpenBachelorS/blob/master/data/tmpl.json. Unknown IDs are not guessed. Explicit alternate background form IDs map independently; a base ID uses its first form, without trying to reproduce the game's time-of-day switching. Future background IDs require a reviewed mapping.
