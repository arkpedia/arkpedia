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

## Event audio preferences

Event Music is the optional event entrance/lobby soundtrack setting, default off.
Version 3 removes browsing Background Music and its source/track picker. A version-1
combined opt-in still migrates to Event Music; an explicit version-2 Event Music
choice is preserved. Removed browsing keys are ignored during import and omitted
from exports. Music elsewhere uses the personal player.

Entering an event with Event Music enabled pauses active personal playback without
changing its queue or position. Leaving or disabling Event Music resumes only the
song the event interrupted. An already paused player stays paused; explicit personal
player actions cancel automatic restoration. Entrance effects use their native cues;
the lobby theme starts at the animation's end.

The first-visit music-playback card offers an unchecked Event Music
checkbox with shared help. Analytics follows after that choice. `externalMediaChosen`
distinguishes an explicit refusal from old privacy records that only chose
analytics; an existing media opt-in remains valid. Choices remain available on
`/cookies` and autoplay is also in Account settings → Audio. Manual playback can
request media permission again after a refusal. Nothing plays before media consent.
Operator greetings and their API were removed; legacy greeting values are discarded
by settings parsing, export and cloud-data validation.

The Event Music switch is available in header Settings, Account settings → Audio,
and privacy choices. Media consent is required. Personal-player playback can still
be started explicitly to take over the event soundtrack.

A separate page-owned engine uses reviewed lobby associations projected into the
event page's `page-music` release table. Calendar tags and reruns resolve to the
original event. An unavailable lobby recording does not invent a replacement.

Event music loops by itself at no more than 15% of the player volume scale, without
changing the stored volume, queue, shuffle or repeat settings. Leaving, disabling
the corresponding music option, or cancelling a pending page request stops it. Explicit player
playback silences the page theme immediately. A paused main player allows the page
theme to play, preserving its song, queue and position. No control is rendered on the page itself.
Blocked playback offers Play event music inside Settings. Page playback never expands the mini player or writes a main-player resume request.
A browser refusal offers Play; it never opens the external-media prompt by itself.
Phones that ignore element volume still use their hardware volume.

Page themes prefer official Monster Siren audio; YouTube-only recordings and the
Data saver choice use YouTube. Ordinary manual music retains its existing delivery preference. No video
or audio is copied or self-hosted. Event associations include reviewed CC lobbies
and are independent of Global release dates. The two Monster Hunter events use reviewed YouTube-only recordings supplied by
`crossoverPageMusic.ts`, merged without duplicate IDs into older catalogues. Their
copyright flag keeps stream-safe mode effective. Other missing recordings remain silent.

Verification: `test-page-audio.ts`, `test-site-settings.ts`, `page-audio.spec.ts`,
plus the existing music resume, data-saver and playback-truth browser checks.


## Retained account background data

The import retains only `background.selected` as `AccountRecord.homeBackground`, validated as a bounded game identifier. The retired browsing-theme UI no longer consumes this field. It never requests a game login or refresh by itself. This field follows the existing imported-data consent category.

`lib/music/menuThemeRecordings.json` is a reviewed snapshot joined from the game's `display_meta_table.json` (`homeBackgroundData.homeBgDataList[].multiFormList[].bgMusicId`) and `audio_data.json` (musics → bankAlias → bgmBanks) to exact PRTS music filenames and published MSR links, reviewed 2026-11-02. Sources: https://github.com/Kengxxiao/ArknightsGameData/tree/master/zh_CN/gamedata/excel and https://prts.wiki/w/音乐鉴赏/游戏内音乐一览. The account shape is also represented in https://github.com/pfyy/OpenBachelorS/blob/master/data/tmpl.json. Unknown IDs are not guessed. Explicit alternate background form IDs map independently; a base ID uses its first form, without trying to reproduce the game's time-of-day switching. Future background IDs require a reviewed mapping.
