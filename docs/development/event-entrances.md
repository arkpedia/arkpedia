# Original event entrances

Supported event links keep their normal Next.js navigation and history. A trusted,
unmodified click (including keyboard activation) arms the fullscreen entrance;
Back/Forward and direct loads do not replay it. Reduced motion bypasses playback.
The modal fades quickly to black, runs the reviewed native timeline, then shrinks
its final menu artwork into the event hero. The hero uses the same menu artwork.
Skip, Escape, navigation cancellation, missing/slow assets and WebGL failure all
release the overlay and page-audio hold. Navigation never waits for the animation.

The initial reviewed coverage is the Global original and rerun of The Masses'
Travels. Other events retain ordinary navigation. Recovered source availability is
broader than renderer support: the asset repository contains legacy and Mecanim
clips that still need conversion and visual review. The current UI renderer uses
original curves, RectTransforms, sprites, masks and GLES3 programs; it omits game
interaction/text controls and ParticleSystem emitters. It never executes recovered
game callbacks.

Native entrance SFX starts at the recorded cue. The event theme is prepared under
the overlay and released at the end of the native timeline, as docking begins.
Both use the existing Event Music choice, external-media consent, volume and
main-player priority. A cancelled intro stops its SFX; normal completion lets its
tail finish. The optional background theme choice remains independent.

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
