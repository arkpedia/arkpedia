# Song Guesser catalogue audit

Reviewed 2026-09-07. The in-game draw contains **343 distinct recordings**: connections cover **51 regular/anniversary events**, **14 mini-events**, **14 main-story chapters (4–17)** and **16 CC operations**. The full library contains **897 recordings**. All 63 entries that lacked a YouTube link returned an audio source from the official MSR API during verification. The [2026-09-08 player review](music-player-catalogue-review-2026-09-08.md) subsequently mapped 47 of those recordings into the shared player; 16 still need matching complete uploads.

## Scope and evidence

The audit covers every Event OST and Vignette OST album currently in `data/albums.json` (66 albums), plus event tracks released in general OSTs and singles. A library category is a review queue, not proof of gameplay use. Every track in those 66 albums is either associated with a verified in-game use or explicitly excluded in `data/music-guesser-review.json`. `npm run audit:music-guesser` and the unit suite fail when a newly added event-album track has no disposition.

Sources:

- [PRTS in-game music list](https://prts.wiki/w/音乐鉴赏) identifies event groupings and boss tracks.
- [PRTS music usage index](https://prts.wiki/w/音乐鉴赏/游戏内音乐一览) links MSR song IDs to internal music names, roles and uses.
- [Japanese BGM reference](https://arknights.wikiru.jp/?BGM) supplies independent track/use checks, including story music.
- [Game stage assets](https://github.com/Kengxxiao/ArknightsGameData/tree/master/zh_CN/gamedata/levels) verify recent stage BGM selection and `PLAY_BGM` phase changes. Recent mappings include OS, UR, ME, TA, PA, TO, SS and Chapters 15–17.
- Existing event and main-story records keep their individual Wiki.gg source links. Banner identities and boss names were checked against local operator/event data; newer names also use the linked enemy references below.

Corrections during review:

- The usage index incorrectly links the Retracing Our Steps menu to the second boss recording. The independent menu listing identifies **048767**; **697685** remains the second boss phase.
- The Japanese table swaps the two When Elegies Are Ashes battle/first-boss song links. The PRTS title/internal-file pairing identifies **048780** as normal battle and **461132** as first boss phase.
- Medjehtiqedti Bound menu text in the usage index repeats the battle title. The song ID and independent table identify **461118** as lobby and **125036** as battle.
- Misty Memory (Acoustic Version) is included for its verified **Lake Silberneherze story** appearance, not as an Adele menu theme.
- Renegade’s vocal single is not substituted for the short instrumental used in Darknights Memoir.
- Lingering Echoes now includes both boss phases. Eblana/Necrass also connects to When Elegies Are Ashes, so broad character answers need a phase or stage when ambiguous.

Recent boss references: [Pavlovich](https://arknights.wiki.gg/wiki/巴普洛维奇，枢密官), [Sleeping Pilot](https://arknights.wiki.gg/wiki/酣睡飞行员), [Yurodstvo/Gabrielus](https://arknights.wiki.gg/wiki/Yurodstvo/Enemy), [AMa-10](https://arknights.wiki.gg/wiki/Kal%27tsit/Enemy), [AMa-10 Isomer](https://arknights.wiki.gg/wiki/AMa-10_Isomer), [End and Beginning](https://arknights.wiki.gg/wiki/End_and_Beginning).

## Event coverage

Counts describe recordings available in this music library, not a claim that the game has no additional audio. Reruns share their event identity; a reused recording appears only once in the random draw. Main-story release anniversaries are listed as chapters in the game. Mini-events may have a unique menu track, reuse another mode’s theme, or reuse battle music. The connections below do not invent a unique boss theme for a mini-event.

### Regular and anniversary events

| Event | Lobby | Battle | Boss | Story |
| --- | ---: | ---: | ---: | ---: |
| A Walk in the Dust | 1 | 1 | 1 | 0 |
| Act or Die | 1 | 1 | 1 | 1 |
| Adventure That Cannot Wait for the Sun | 1 | 2 | 1 | 2 |
| Ato | 2 | 2 | 1 | 2 |
| Babel | 1 | 1 | 1 | 2 |
| Break the Ice | 1 | 2 | 1 | 0 |
| Code of Brawl | 1 | 2 | 1 | 2 |
| Come Catastrophes or Wakes of Vultures | 1 | 1 | 1 | 0 |
| Darknights Memoir | 1 | 4 | 0 | 0 |
| Delicious On Terra | 1 | 2 | 1 | 0 |
| Dorothy's Vision | 1 | 1 | 1 | 0 |
| Dossoles Holiday | 1 | 2 | 1 | 0 |
| Ending a Grand Overture | 1 | 1 | 1 | 2 |
| Exodus from the Pale Sea | 1 | 1 | 1 | 2 |
| First of A Thousand Autumns | 1 | 2 | 1 | 2 |
| Grani and the Knights' Treasure | 1 | 0 | 0 | 0 |
| Guide Ahead | 1 | 1 | 1 | 0 |
| Heart of Surging Flame | 3 | 0 | 0 | 0 |
| Here A People Sows | 1 | 2 | 1 | 0 |
| Hortus de Escapismo | 1 | 1 | 1 | 2 |
| I Portatori dei Velluti | 1 | 2 | 1 | 2 |
| Ideal City | 1 | 2 | 1 | 0 |
| Il Siracusano | 1 | 1 | 1 | 0 |
| Invitation to Wine | 1 | 2 | 1 | 0 |
| Lingering Echoes | 1 | 1 | 2 | 0 |
| Lone Trail | 1 | 2 | 1 | 2 |
| Mansfield Break | 1 | 2 | 1 | 0 |
| Maria Nearl | 1 | 2 | 1 | 0 |
| Medjehtiqedti Bound | 1 | 1 | 1 | 2 |
| Near Light | 1 | 2 | 1 | 0 |
| Operation Lucent Arrowhead | 1 | 1 | 1 | 0 |
| Operation Originium Dust | 1 | 2 | 1 | 0 |
| Path of Life | 1 | 1 | 1 | 2 |
| People, A People | 2 | 1 | 1 | 2 |
| Retracing Our Steps | 1 | 2 | 2 | 2 |
| So Long, Adele | 2 | 2 | 1 | 1 |
| Somniloquium Serenum | 1 | 1 | 1 | 0 |
| Stultifera Navis | 1 | 3 | 1 | 0 |
| Such is the Joy of Our Reunion | 1 | 2 | 1 | 1 |
| The Great Chief Returns | 1 | 3 | 1 | 0 |
| The Masses' Travels | 1 | 2 | 2 | 2 |
| The Rides to Lake Silberneherze | 1 | 1 | 1 | 1 |
| Till the Lands Become an Orange | 2 | 2 | 1 | 4 |
| Twilight of Wolumonde | 1 | 2 | 1 | 0 |
| Under Tides | 1 | 1 | 1 | 0 |
| Unrealized Realities | 1 | 1 | 1 | 2 |
| What the Firelight Casts | 1 | 1 | 1 | 0 |
| When Elegies Are Ashes | 1 | 1 | 2 | 2 |
| Where Vernal Winds Will Never Blow | 1 | 2 | 1 | 0 |
| Who is Real | 1 | 3 | 1 | 0 |
| Zwillingstürme im Herbst | 1 | 2 | 3 | 1 |

### Mini-events

| Event | Lobby | Battle | Boss | Story |
| --- | ---: | ---: | ---: | ---: |
| A Death in Chunfen | 1 | 0 | 0 | 0 |
| A Kazdelian Rescue | 1 | 0 | 0 | 0 |
| Ancient Forge | 0 | 0 | 0 | 1 |
| Beyond Here | 1 | 0 | 0 | 0 |
| Bolívar Diagnosed | 1 | 0 | 0 | 0 |
| Children of Ursus | 1 | 0 | 0 | 0 |
| Crossing | 1 | 0 | 0 | 0 |
| Fantasy in the Mirage | 1 | 0 | 0 | 0 |
| Pinus Sylvestris | 1 | 0 | 0 | 0 |
| Rewinding Breeze | 1 | 0 | 0 | 0 |
| See You Soon | 1 | 0 | 0 | 0 |
| Stories of Afternoon | 1 | 0 | 0 | 0 |
| The Black Forest Wills A Dream | 1 | 0 | 0 | 0 |
| To the Grinning Valley | 1 | 0 | 0 | 0 |

## Unavailable event recordings

- **A Flurry to the Flame:** Monster Hunter soundtrack recordings are not in the current music library.
- **Thunder in the Azure Dream:** Monster Hunter Rise soundtrack recordings are not in the current music library.
- **Sur le lac lune vivante:** The newly released crossover soundtrack is not in the current music library.

Some covered events also have unreleased BGM absent from the catalogue. For example, Heart of Surging Flame has three released menu recordings here, but its dedicated battle themes are not in the library. Grani includes the rerun menu recording. A Light Spark in Darkness, An Obscure Wanderer and To Be Continued currently have promotional singles in the library, which do not establish in-game menu recordings.

## Explicitly excluded event-album tracks

These remain playable in Full music library with their titles. They are not randomly drawn in In-game selection.

| Song ID | Track | Reason |
| --- | --- | --- |
| 953918 | 将进酒 | Promotional recording; no matching in-game use verified. |
| 125007 | Hunter's Song | Promotional recording; no matching in-game use verified. |
| 697639 | 红松的骑士 | Promotional recording; no matching in-game use verified. |
| 125087 | 我的生活 | Promotional recording; no matching in-game use verified. |
| 461168 | 回首来处 | Promotional recording; no matching in-game use verified. |
| 306819 | 待续 | Promotional recording; no matching in-game use verified. |
| 232265 | A World Above | Promotional recording; no matching in-game use verified. |
| 779491 | Rhine Lab.LLC | Promotional recording; no matching in-game use verified. |
| 514542 | Blues with you | Promotional recording; no matching in-game use verified. |
| 048700 | Bubble | Promotional recording; no matching in-game use verified. |
| 697629 | 绿意游曳 | Promotional recording; no matching in-game use verified. |
| 514549 | So Long for Another Summer | Promotional recording; no matching in-game use verified. |
| 461154 | Drifting Blossom | Promotional recording; no matching in-game use verified. |
| 880330 | Scordatura | Promotional recording; no matching in-game use verified. |
| 514536 | 颠颠荡荡 | Promotional recording; no matching in-game use verified. |
| 048796 | Broken Sun | Promotional recording; no matching in-game use verified. |
| 125040 | Immersion | Promotional recording; no matching in-game use verified. |
| 880355 | 我即荒野 | Unused instrumental bonus arrangement of Signore dei Lupi. |
| 306890 | AmbiguousMorality (Instrumental) | Instrumental bonus arrangement; the event uses the vocal Ambiguous Morality. |
| 779463 | Suspense | Alternate mix; the event menu uses Suspense (Alt Mix). |
| 232269 | Before the Cessation | The story uses cello/piano arrangements; this release is the preview recording. |
