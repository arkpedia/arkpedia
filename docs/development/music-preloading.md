# Next-song preloading

The player uses `nextQueueStep` and `nextAutoplayTracks` for both playback and preloading. It
prepares one upcoming Monster Siren file after the current song has played for three seconds
and has at least fifteen seconds buffered (or its entire remaining duration). Repeat one
reuses the current file. YouTube embeds have no separate next-song buffer.

`lib/music/audioPreload.ts` fetches a complete public audio response with no credentials and
low priority. It holds at most one upcoming Blob, capped at 80 MiB, with a 90-second download
timeout and a fifteen-minute usable lifetime. Data saver, including the browser's `saveData`
preference, disables speculative loading. Pausing cancels incomplete work and retains a
completed matching file; changing the next song aborts and releases stale work.

Playback consumes an already complete file synchronously through the existing audio element
(`audioElement.ts`). Its Blob URL is released when playback replaces or releases that file.
This preserves the element and synchronous Play path used by iOS and lock-screen controls.
Incomplete, expired, refused, oversized or cross-origin-blocked downloads immediately fall
back to the normal streaming address. Preloading never delays the next song.
It removes a network wait when ready; it does not trim encoded
silence or promise sample-accurate gapless playback.

Audio travels directly from Monster Siren's CDN after `/api/music-audio/<cid>` returns a 302
to its signed HTTPS address. Vercel serves only the redirect, not the audio bytes. Playback
uses anonymous cross-origin media requests, matching the preloader's credential-free CDN reads.
Neither playback nor preloading uses the retired music relay; the old browser preference is removed on
first use and old `audio-relay` query parameters are ignored. The account-import relay is
separate and is unchanged. Failed playback stays paused with Retry/Play available, rather
than remembering a different delivery route for later songs.

Regression coverage: `scripts/tests/test-music-audio-preload.ts`,
`tests/browser/music-audio-truth.spec.ts` and `tests/browser/music-preload.spec.ts`.
