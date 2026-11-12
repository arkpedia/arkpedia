# Native mobile audio adapter

The mobile shell (`arkpedia/arkpedia-mobile`) adds native Monster Siren playback,
system media controls and Favourite/Don't autoplay actions. Since 0.3, iOS uses
only the system Now Playing card; Apple chooses its favourite icon and layout.

`lib/music/nativeAudio.ts` selects the native bridge only on the canonical
production origin when the app exposes `ArkpediaAudio`. Browser playback, Preview,
and older app builds retain the existing web engines. YouTube playback stays in
its iframe. Native queue snapshots preserve the current chosen order and stop at
YouTube boundaries, rather than silently skipping unavailable tracks.

The adapter pauses/releases the browser audio element before a native load and
disables browser Media Session metadata for that stream. Native song changes update
the existing queue index, history, transport and resume record. Page reloads adopt
an existing native session instead of restarting its audio. Native playback has no
browser Web Audio samples. On iOS 0.3.1+, the optional `getSpectrum` method returns
48 logarithmic levels from the AVPlayer stream (62.5 Hz–16 kHz, −90 to −18 dBFS).
`nativeSpectrum.ts` requests at most one frame at a time, only while visible,
playing and not in reduced-motion mode. It rejects stale-track, unavailable and
malformed frames; a delayed response cannot revive a removed plot. Older builds,
Android and YouTube remain explicitly unavailable, without a duplicate web stream.

Favourite/Don't autoplay edits are absolute, revisioned values. They are applied
once to the existing local storage; the revision is acknowledged with a fresh web
snapshot. Native session sequence numbers prevent a delayed bridge response from
rewinding newer playback state. No account credentials are passed to native code.

Validation: `scripts/tests/test-native-audio.ts` covers ordering, repeat, source
boundaries, storage reconciliation and stale state. `tests/browser/music-native-audio.spec.ts`
serves the local checked website under an intercepted production URL and simulates
the native bridge. It exercises desktop/mobile and both themes without visiting
production or playing remote audio. Physical lock-screen/background behavior and
signed iOS playback remain device acceptance checks in the mobile repository.
`music-native-spectrum.spec.ts` covers native levels, pause/resume, mode changes,
reduced motion, hidden pages, stale responses and single-flight requests in both
themes and viewports. The mobile build separately tests FFT frequency/level and
PCM capture with generated audio; neither replaces physical iPhone testing.
