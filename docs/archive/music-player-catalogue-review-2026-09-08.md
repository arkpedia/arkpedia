# Music player catalogue review — 2026-09-08

The Song Guesser contained 897 official MSR recordings, but the shared YouTube player skipped 63 records with empty video IDs. This review adds 47 verified playback mappings through the existing `data/albums.json` catalogue. The player now includes 881 tracks; 16 still use the clearly labeled Monster Siren Records fallback. No alternate playback engine or hosted audio assets were added.

## Verification

- Checked all 63 official song records and all 22 affected albums against the MSR API. All IDs, original titles, album associations, cover URLs and existing lyric URLs matched. Local album artwork was compared with the official originals; mean RGB differences after normalization were below 1/255. Existing character associations and Base artwork remain in the normal catalogue projection.
- Checked every new video is public and embeddable, then compared its audio with the official MSR recording using full-track waveform alignment and segment checks. Rejected vocal/instrumental substitutions, covers, compilations, extended loops, shortened openings and different mixes. Temporary audio used for analysis is not included in the repository.
- All 15 existing own LRC files match the official lyric text after whitespace normalization, with exactly matching timestamp sequences. Two additional sibling LRC files were checked the same way. Heavenly Me, Summer Fizz Pop and Every Road is a Yes vocal/instrumental timelines have zero relative offset, so their existing karaoke lyrics can be reused unchanged. All 18 newly playable tracks with lyrics use the existing build-generated `/lyrics/{videoId}.json` files, parser, lazy loading, highlighting and seeking. The measured video offsets for these lyric tracks are at most 0.068 seconds.
- Some uploads omit a short near-silent or very quiet trailing fade (at most 1.53 seconds); those differences are noted below. Files with omitted audible musical passages were rejected.
- This is a review of recording identity and source timestamps, not a new transcription or a fresh word-by-word human retiming. No lyric text or timestamps were fabricated, and tracks with no official/local lyric file retain the existing no-lyrics state.

## Added playback mappings

| MSR ID | Track | Video | Audio alignment offset | Source correlation | Notes |
| --- | --- | --- | --- | --- | --- |
| [461191](https://monster-siren.hypergryph.com/music/461191) | Operation Barrenland (W&W Soundtrack Mix) | [Md9ZFgLsPFk](https://www.youtube.com/watch?v=Md9ZFgLsPFk) | +0.1545s | 0.996 | Verified recording. |
| [779424](https://monster-siren.hypergryph.com/music/779424) | Tower Fierce | [BldExwBtnGo](https://www.youtube.com/watch?v=BldExwBtnGo) | +0.0215s | 0.938 | Verified recording. |
| [048709](https://monster-siren.hypergryph.com/music/048709) | Intro: Reminiscence | [9meT8vri6o0](https://www.youtube.com/watch?v=9meT8vri6o0) | +0.0000s | 0.999 | Verified recording. |
| [125056](https://monster-siren.hypergryph.com/music/125056) | A Toda Vela | [IDNGBvVF8BU](https://www.youtube.com/watch?v=IDNGBvVF8BU) | +0.0000s | 0.996 | Verified recording. |
| [953963](https://monster-siren.hypergryph.com/music/953963) | Las Salvas | [SOp2T1kVZtY](https://www.youtube.com/watch?v=SOp2T1kVZtY) | +0.0000s | 0.996 | Verified recording. |
| [125055](https://monster-siren.hypergryph.com/music/125055) | El Muerto Vivo | [lzO-4qrYj34](https://www.youtube.com/watch?v=lzO-4qrYj34) | +0.0000s | 0.996 | Verified recording. |
| [779471](https://monster-siren.hypergryph.com/music/779471) | El Puerto de la Sal | [-8hFZhHuiFo](https://www.youtube.com/watch?v=-8hFZhHuiFo) | +0.0000s | 0.998 | Verified recording. |
| [048782](https://monster-siren.hypergryph.com/music/048782) | Bailar en la Cuerda Floja | [eNYjCOZyMvs](https://www.youtube.com/watch?v=eNYjCOZyMvs) | +0.0000s | 0.996 | Verified recording. |
| [514518](https://monster-siren.hypergryph.com/music/514518) | Heavenly Me (Instrumental) | [0DgfteFHK20](https://www.youtube.com/watch?v=0DgfteFHK20) | +0.0000s | 0.997 | Verified recording. |
| [306881](https://monster-siren.hypergryph.com/music/306881) | Summer Fizz Pop (Instrumental) | [aaCaU4L-kJQ](https://www.youtube.com/watch?v=aaCaU4L-kJQ) | +0.0000s | 0.998 | Official instrumental length is 03:25. |
| [779462](https://monster-siren.hypergryph.com/music/779462) | Muse | [-ODjQojL-9Q](https://www.youtube.com/watch?v=-ODjQojL-9Q) | +0.0215s | 0.887 | Verified recording. |
| [048770](https://monster-siren.hypergryph.com/music/048770) | Moonlit Mirage | [yWrHVfxacmU](https://www.youtube.com/watch?v=yWrHVfxacmU) | +0.0215s | 0.896 | Verified recording. |
| [125049](https://monster-siren.hypergryph.com/music/125049) | The Wild Era | [MVymNf3P0ws](https://www.youtube.com/watch?v=MVymNf3P0ws) | +0.0215s | 0.931 | Verified recording. |
| [953954](https://monster-siren.hypergryph.com/music/953954) | Blooms of Time | [K3tPh4E2fzg](https://www.youtube.com/watch?v=K3tPh4E2fzg) | +0.0215s | 0.821 | Verified recording. |
| [880307](https://monster-siren.hypergryph.com/music/880307) | Echoes of Legends | [IiaxqdLR5kY](https://www.youtube.com/watch?v=IiaxqdLR5kY) | +0.0000s | 0.998 | Verified recording. |
| [514513](https://monster-siren.hypergryph.com/music/514513) | Battleplan Arclight | [LevPoT72rbw](https://www.youtube.com/watch?v=LevPoT72rbw) | +0.0440s | 0.864 | Verified recording. |
| [880305](https://monster-siren.hypergryph.com/music/880305) | Levitation | [YTbKflTukLA](https://www.youtube.com/watch?v=YTbKflTukLA) | +0.0000s | 0.996 | Verified recording. |
| [232220](https://monster-siren.hypergryph.com/music/232220) | Theoretical Simulation | [XaxeSJthwRc](https://www.youtube.com/watch?v=XaxeSJthwRc) | +0.0215s | 0.952 | Verified recording. |
| [514508](https://monster-siren.hypergryph.com/music/514508) | Garden of Grotesqueries | [3eSyj3OpJT0](https://www.youtube.com/watch?v=3eSyj3OpJT0) | -0.0345s | 0.971 | Verified recording. |
| [461116](https://monster-siren.hypergryph.com/music/461116) | A Universe of Its Own | [XWguMCxtEt8](https://www.youtube.com/watch?v=XWguMCxtEt8) | +0.0215s | 0.956 | Verified recording. |
| [048762](https://monster-siren.hypergryph.com/music/048762) | Shackles for the Unfettered | [S4UJE7zRh54](https://www.youtube.com/watch?v=S4UJE7zRh54) | +0.0215s | 0.958 | Verified recording. |
| [779454](https://monster-siren.hypergryph.com/music/779454) | The Architect of Ways | [wBJGY9lmdIE](https://www.youtube.com/watch?v=wBJGY9lmdIE) | +0.0000s | 0.997 | Verified recording. |
| [880398](https://monster-siren.hypergryph.com/music/880398) | A Mind, Tempest-Tossed | [0TlOi14Tvho](https://www.youtube.com/watch?v=0TlOi14Tvho) | +0.0215s | 0.936 | Short quiet/faded tail difference. |
| [779453](https://monster-siren.hypergryph.com/music/779453) | A Stroll in the Tomb of Sui | [sjWqCKP6kkA](https://www.youtube.com/watch?v=sjWqCKP6kkA) | +0.0000s | 0.999 | Short quiet/faded tail difference. |
| [125032](https://monster-siren.hypergryph.com/music/125032) | Dispelling the Dark | [MrDzyaemhgo](https://www.youtube.com/watch?v=MrDzyaemhgo) | +0.0215s | 0.924 | Short quiet/faded tail difference. |
| [461114](https://monster-siren.hypergryph.com/music/461114) | One Fight | [_B6pNOEWMOw](https://www.youtube.com/watch?v=_B6pNOEWMOw) | +0.0215s | 0.944 | Retains the studio opening; only near-silent tail omitted. |
| [048760](https://monster-siren.hypergryph.com/music/048760) | In Due Time | [bG16yKgiNX0](https://www.youtube.com/watch?v=bG16yKgiNX0) | +0.0215s | 0.871 | Verified recording. |
| [125021](https://monster-siren.hypergryph.com/music/125021) | Soul Migration | [9GEY7aScJa0](https://www.youtube.com/watch?v=9GEY7aScJa0) | +0.0960s | 0.608 | Verified recording. |
| [461102](https://monster-siren.hypergryph.com/music/461102) | What an Electromagnetic Night | [i-OXZwwarCM](https://www.youtube.com/watch?v=i-OXZwwarCM) | +0.0675s | 0.885 | Verified recording. |
| [048759](https://monster-siren.hypergryph.com/music/048759) | The Congregation | [MLF0Rrl_qMQ](https://www.youtube.com/watch?v=MLF0Rrl_qMQ) | +0.0215s | 0.906 | Verified recording. |
| [779444](https://monster-siren.hypergryph.com/music/779444) | The Scripted | [VRd0G7sdYms](https://www.youtube.com/watch?v=VRd0G7sdYms) | +0.0215s | 0.941 | Verified recording. |
| [306867](https://monster-siren.hypergryph.com/music/306867) | ASTRIVAGANT | [I3D0GkZ1SdE](https://www.youtube.com/watch?v=I3D0GkZ1SdE) | +0.0215s | 0.922 | Studio recording; rejects the different official theme-video mix. |
| [953938](https://monster-siren.hypergryph.com/music/953938) | HUA YU | [_UQ4mwJZN8s](https://www.youtube.com/watch?v=_UQ4mwJZN8s) | +0.0000s | 0.987 | Official studio upload; excludes the longer music-video version. |
| [880386](https://monster-siren.hypergryph.com/music/880386) | Play Time | [5XO9q329Bhk](https://www.youtube.com/watch?v=5XO9q329Bhk) | +0.0215s | 0.872 | Short quiet/faded tail difference. |
| [514592](https://monster-siren.hypergryph.com/music/514592) | Every Road is a Yes | [_9pidxJdnng](https://www.youtube.com/watch?v=_9pidxJdnng) | +0.0000s | 0.998 | Verified recording. |
| [125020](https://monster-siren.hypergryph.com/music/125020) | Every Road is a Yes (Instrumental) | [nOHa7MdO-bc](https://www.youtube.com/watch?v=nOHa7MdO-bc) | +0.0000s | 0.998 | Verified recording. |
| [232219](https://monster-siren.hypergryph.com/music/232219) | Unused Windshield Wipers | [TRyuO78uVtM](https://www.youtube.com/watch?v=TRyuO78uVtM) | +0.0000s | 0.997 | Verified recording. |
| [697674](https://monster-siren.hypergryph.com/music/697674) | Till the Lands Become an Orange | [3QwEDmPdi8g](https://www.youtube.com/watch?v=3QwEDmPdi8g) | +0.0000s | 0.997 | Verified recording. |
| [953937](https://monster-siren.hypergryph.com/music/953937) | Swaying Road Signs | [0Q3i9PPLhRE](https://www.youtube.com/watch?v=0Q3i9PPLhRE) | +0.0000s | 0.999 | Verified recording. |
| [048758](https://monster-siren.hypergryph.com/music/048758) | Falling into The Sky | [nmEv1hKZ6RI](https://www.youtube.com/watch?v=nmEv1hKZ6RI) | +0.0000s | 0.997 | Verified recording. |
| [306866](https://monster-siren.hypergryph.com/music/306866) | Breathing Amidst Stars | [fpBo-HzLUQk](https://www.youtube.com/watch?v=fpBo-HzLUQk) | +0.0000s | 0.998 | Verified recording. |
| [697673](https://monster-siren.hypergryph.com/music/697673) | Dreams In Sync | [rEliIqSPLL4](https://www.youtube.com/watch?v=rEliIqSPLL4) | +0.0000s | 0.990 | Verified recording. |
| [306865](https://monster-siren.hypergryph.com/music/306865) | Water Gun Showdown | [81w54mmw4bo](https://www.youtube.com/watch?v=81w54mmw4bo) | +0.0000s | 0.994 | Verified recording. |
| [514591](https://monster-siren.hypergryph.com/music/514591) | Even Worries Blends Into The Sky | [z4Z5_jtyN0g](https://www.youtube.com/watch?v=z4Z5_jtyN0g) | +0.0000s | 0.996 | Verified recording. |
| [779442](https://monster-siren.hypergryph.com/music/779442) | Ultimate Furry Battle! | [nxcuLRX5fps](https://www.youtube.com/watch?v=nxcuLRX5fps) | +0.0000s | 0.997 | Verified recording. |
| [461100](https://monster-siren.hypergryph.com/music/461100) | Sparkling Days | [H1fsadawGa4](https://www.youtube.com/watch?v=H1fsadawGa4) | +0.0000s | 0.998 | Verified recording. |
| [125029](https://monster-siren.hypergryph.com/music/125029) | A Secluded Path | [qJX_Ju7vOHk](https://www.youtube.com/watch?v=qJX_Ju7vOHk) | +0.0000s | 0.999 | Verified recording. |

Positive alignment offset means the YouTube recording starts later than the MSR master. Sub-frame codec delays are recorded for audit purposes; the official LRC timestamps remain unchanged.

## Remaining source gaps

These tracks remain playable as clues from MSR. No verified matching complete YouTube upload was found for the shared player. Their existing metadata remains available for a future mapping.

| MSR ID | Track | Reason |
| --- | --- | --- |
| [697616](https://monster-siren.hypergryph.com/music/697616) | Yanking(Instrumental) | No matching instrumental upload verified; vocal versions were not substituted. |
| [125033](https://monster-siren.hypergryph.com/music/125033) | Pacing Through Eternity | Candidate removes 2.93 seconds from the opening. |
| [461115](https://monster-siren.hypergryph.com/music/461115) | Perchance to Dream | No complete matching upload verified. |
| [697681](https://monster-siren.hypergryph.com/music/697681) | O Miserly Heaven | No complete matching upload verified. |
| [306870](https://monster-siren.hypergryph.com/music/306870) | Tale of the Boundless | No complete matching upload verified. |
| [953949](https://monster-siren.hypergryph.com/music/953949) | The Climes of Sui | No complete matching upload verified. |
| [514507](https://monster-siren.hypergryph.com/music/514507) | Fragments | No complete matching upload verified. |
| [232225](https://monster-siren.hypergryph.com/music/232225) | The Rule of Justice | No complete matching upload verified. |
| [048761](https://monster-siren.hypergryph.com/music/048761) | A Room With a View | Candidate removes 7.16 seconds from the opening and about 3.5 seconds from the ending. |
| [697680](https://monster-siren.hypergryph.com/music/697680) | Doctor VS Doctor? | No complete matching upload verified. |
| [306879](https://monster-siren.hypergryph.com/music/306879) | TOO EASY | No complete matching upload verified. |
| [880397](https://monster-siren.hypergryph.com/music/880397) | One Fight (Instrumental) | No matching instrumental upload verified; vocal versions were not substituted. |
| [697689](https://monster-siren.hypergryph.com/music/697689) | In Due Time (Instrumental) | No matching instrumental upload verified; vocal versions were not substituted. |
| [880394](https://monster-siren.hypergryph.com/music/880394) | Dribbling Fever | Available short upload cuts an audible ending; other results are extended loops/remixes. |
| [232210](https://monster-siren.hypergryph.com/music/232210) | What an Electromagnetic Night (Instrumental) | No matching instrumental upload verified; vocal versions were not substituted. |
| [779443](https://monster-siren.hypergryph.com/music/779443) | Play Time (Instrumental) | No matching instrumental upload verified; vocal versions were not substituted. |

## Metadata corrections

- HUA YU now uses its 03:46 studio duration and the credited artist, composers, arranger, lyricist, performers, mixing and mastering roles. Yukihito is credited for arranging/bass rather than composing. Sources: [official artist distributor](https://linkco.re/qsmcn3qb?lang=en), [Mili’s official release](https://www.bilibili.com/video/BV1G6KF6qEAb/).
- Intro: Reminiscence retains Larry Herron and Erik Castro; credits explicitly belonging to the adjacent Before & After track were removed from the intro. [Distributor upload](https://www.youtube.com/watch?v=9meT8vri6o0).
- Summer Fizz Pop instrumental is 03:25, verified from the official MSR source rather than the longer music-video duration. Its vocal-sibling lyrics use the same studio timeline.
- Added six missing album release dates and seven missing track credit lists using distributor metadata. These fields continue through the existing album/detail/queue pipeline.
- Dribbling Fever uses the title published by the distributor while preserving the MSR original title. Doctor VS Doctor? and Soul Migration are explicitly **editorial literal translations**, not verified official English titles; their original titles remain intact.
- Yanking instrumental now explicitly references its existing same-album vocal LRC. Its vocal/instrumental timelines were separately verified at zero offset, and the lyric text/timestamps match the official file. This fixes that record’s punctuation-related lookup gap without enabling unreviewed karaoke on unrelated songs. It still needs a verified playback mapping.
- The shared player and lyric resolver remain unchanged. All new playable entries use the same existing catalogue projection, title display, album assets, generated LRC files and player controls as the rest of the library.

| Metadata | Verified source |
| --- | --- |
| Ambience Synesthesia 2025 release — 2025/07/25 | [QQ Music album 71330048](https://y.qq.com/w/album.html?albumId=71330048) |
| Stronghold Protocol: Alliance release — 2025/11/16; SKa2or credit | [QQ Music album 78425990](https://y.qq.com/w/album.html?albumId=78425990) |
| Rhodes Island Epic release — 2026/04/02; 秋田真典 and 土屋裕一 credits | [Hypergryph distributor metadata](https://www.qobuz.com/jp-ja/album/rhodes-island-epic-msr-/zmdvvettd3a1s) |
| Positional Football Championship release — 2026/06/10 | [QQ Music album 94271905](https://y.qq.com/w/album.html?albumId=94271905) |
| Dribbling Fever title and 永島光 credit | [QQ Music track](https://y.qq.com/n/ryqq/songDetail/003WJAtw3JDhUj), [composer’s announcement](https://x.com/mz0re/status/2072617043103461530) |
| Bolívar Diagnosed release — 2026/07/12; Yoshimi Kudo credit | [QQ Music album 96819038](https://y.qq.com/w/album.html?albumId=96819038), [track metadata](https://y.qq.com/n/ryqq/songDetail/001V2WXr1ad1af) |
| Interactive Exhibition release — 2026/08/10; Castalia Audio, Bangler and 红唐 credits | [Hypergryph distributor metadata](https://www.qobuz.com/jp-ja/album/-original-soundtrack-msr-castalia-audio-bangler-/nicdfubn5f2i1) |

Unknown genres or unverified credit roles were left unspecified. Play Time and Muse have no official MSR LRC link; they retain the usual no-lyrics state.

## Validation

All 45 music tests, TypeScript and targeted ESLint passed. The combined dev production build generated all 637 pages. Browser checks passed 15 track scenarios plus six focused lyric-seek checks across Chromium, Firefox and mobile WebKit; the dev production build passed all five track scenarios in Firefox. Covers, credits, original/translated title switching, lyric loading/highlighting/seeking, instrumental karaoke, the no-lyrics state and same-tab handoff were checked using real catalogue and asset files. YouTube SDK and clue audio fixtures made these interface checks deterministic; they did not test external streaming. The separate recording comparisons above used actual source audio.
