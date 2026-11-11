# Native mobile audio adapter

The 0.2 mobile shell (`arkpedia/arkpedia-mobile`) adds native Monster Siren playback,
system media controls and Favourite/Don't autoplay actions. Its iOS 17+ companion
Live Activity exposes both preference buttons; iOS still controls the built-in
Now Playing layout and whether authentication is required.

`lib/music/nativeAudio.ts` selects the native bridge only on the canonical
production origin when the app exposes `ArkpediaAudio`. Browser playback, Preview,
and older app builds retain the existing web engines. YouTube playback stays in
its iframe. Native queue snapshots preserve the current chosen order and stop at
YouTube boundaries, rather than silently skipping unavailable tracks.

The adapter pauses/releases the browser audio element before a native load and
disables browser Media Session metadata for that stream. Native song changes update
the existing queue index, history, transport and resume record. Page reloads adopt
an existing native session instead of restarting its audio. Native playback has no
Web Audio samples, so it does not drive the browser spectrum visualization.

Favourite/Don't autoplay edits are absolute, revisioned values. They are applied
once to the existing local storage; the revision is acknowledged with a fresh web
snapshot. Native session sequence numbers prevent a delayed bridge response from
rewinding newer playback state. No account credentials are passed to native code.

Validation: `scripts/tests/test-native-audio.ts` covers ordering, repeat, source
boundaries, storage reconciliation and stale state. `tests/browser/music-native-audio.spec.ts`
serves the local checked website under an intercepted production URL and simulates
the native bridge. It exercises desktop/mobile and both themes without visiting
production or playing remote audio. Physical lock-screen/background behavior and
signed iOS intents remain device acceptance checks in the mobile repository.
