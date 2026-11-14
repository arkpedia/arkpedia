# Original event entrances

Supported event links keep their normal Next.js navigation and history. A trusted,
unmodified click (including keyboard activation) arms the fullscreen entrance;
Back/Forward and direct loads do not replay it. Reduced motion bypasses playback.
The modal fades quickly to black, runs the reviewed native timeline, then shrinks
its final menu artwork into the event hero. The hero uses the same menu artwork.
Skip, Escape, navigation cancellation, missing/slow assets and WebGL failure all
release the overlay and page-audio hold. Navigation never waits for the animation.

The support list includes the Global original/rerun of The Masses' Travels and
reviewed CN menus for upcoming events, reruns and past events. Global, Japan and
Korea reset-clock choices share that event catalogue; the reader's clock does not
restrict the pack's source region. The asset repository also holds a reviewed CN
menu awaiting its site event record. Unlisted events retain ordinary navigation.
Recovered source availability is broader than renderer support. The UI renderer
uses original curves, RectTransforms, sprites, rectangular/soft masks and GLES3
programs, including animated material values and original shader keyword variants.
Unambiguous streamed/constant Mecanim UI channels are supported; dense channels,
unknown bindings and ambiguous Animator owners fail conversion. Game controls/text,
ParticleSystem emitters and non-UI mesh effects are omitted. Custom stencil masks
and runtime-populated menus that fail visual review are not enabled. Recovered game
callbacks are never executed.

Native entrance SFX starts at the recorded cue. The event theme is prepared under
the overlay and released at the end of the native timeline, as docking begins.
Both use the existing Event Music choice, external-media consent, volume and
main-player priority. A cancelled intro stops its SFX; normal completion lets its
tail finish. The optional background theme choice remains independent.
Cold taps give the SFX the remaining entrance load budget, rather than requiring
a hover-preloaded sound. Page themes use official Monster Siren audio where
available, following the main player's Data saver choice for YouTube playback.
While an entrance holds playback, official themes resolve their signed audio
address ahead without borrowing the personal queue's preloader. The handoff can
start directly from the CDN; a failed/expired preparation uses ordinary streaming.
Flurry and Act or Die's recovered entrance clips contain no serialized SFX cue;
their animations do not receive an invented sound association or timing.

## Adding a reviewed pack

1. Recover the original event and exact-version dependencies in
   `arkpedia-l2d-assets/event-transitions`. Keep regional variants/reruns separate.
2. Convert the original clip with `scripts/build_event_player.py`, explicitly
   selecting verified SFX associations. Unsupported bindings fail conversion.
3. Render the entrance and final menu frame with `lib/events/gameUiPlayer.ts`.
   Inspect native timing/shaders, desktop/mobile crop, final hero and audio cues.
   Save the final 1280×720 menu frame as `menu.webp` and seal the pack using the
   asset repository's `event_player_manifest.py`. Record any known omissions.
4. Pass source/player validation and publish the immutable asset revision through
   the existing R2 mirror owner (`animation_revision` workflow input).
5. Add only reviewed entries to `config/event-entrances.json`, using the published
   revision. Keep this support list code-owned: its URLs are included in the asset
   mirror plan. Never enable a source solely because its clip name looks promising.
6. Run curve/matching tests, entrance and page-audio browser tests, then the checked
   source Preview and deployed journey, including silent, skip, reduced motion,
   loading failure and Back/Forward. Confirm the CDN serves the actual pack.

Assets warm on event-link hover/focus and keep one prepared scene. Playback is
bounded by a short load budget; it skips instead of leaving a blocking black
screen on an unavailable or slow connection. Fullscreen art covers the viewport
without stretching; unusual aspects crop its edges, revealing the full frame as
it docks into the 16:9 hero.

For local frame review, run
`node scripts/audits/event-entrance-review.mjs <asset-repo>/event-transitions/players`.
Open `http://127.0.0.1:3212`, choose a pack and scrub its native timeline. The
1280×720 canvas and `window.draw(seconds)` / `window.ready` hooks allow repeatable
final-frame captures with Playwright at device scale factor 1. This local tool
uses the exact application renderer and does not provide a production fallback.

## Published recovery and validation

The November 14 recovery release pins asset revision
`bcd0bde60902bd1058cfa6f28fd9057f1c7b1817`: 18 sealed player packs,
including 16 newly reviewed CN packs. Fifteen additions have matching site event
records, giving 17 enabled original/rerun variants. The future CN menu without a
site record stays archived. Fourteen new packs have recovered native SFX cues.

Asset-only publication verified all 982 runtime files and the sealed manifest
against their recorded hashes, sizes, MIME types and CORS responses; all 16 MP3s
passed range checks. The build loader includes the independent event pin when
bundling native media maps. Unchanged Global packs resolve through their physical
reuse revision; consumers must not construct URLs at the logical revision alone.
The asset-only workflow did not promote a different live content release.

[Full application CI](https://github.com/arkpedia/arkpedia/actions/runs/43578263193)
passed for the expanded renderer, catalogue and audio handoff. The existing
Masses' Travels rerun also passed real production playback: its SFX starts at the
recorded 0.016667-second cue and official Monster Siren music reaches playing,
without provider mocks. Desktop dark and mobile light checks passed fullscreen,
docking, Back/Forward, Escape, reduced motion and media opt-out. The expanded
catalogue still requires its own checked-source Preview and deployed acceptance.
