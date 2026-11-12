# Music recording and lyric audit — 9 November 2026

The recording audit covers 1,175 catalogue rows and all 142 named instrumentals.
The [evidence register](music-timing-2026-11-09.json) records the measurements and
per-song lyric sample outcomes. Runtime offsets live in
[`music-recording-timings.json`](../../config/music-recording-timings.json).

## Confirmed repairs

- Use the same album-scoped, unique version matcher for switching and lyric inheritance.
  Accept full-width/mixed brackets, missing or extra spaces, case differences and
  `Instrumental Version`. Do not guess between several vocal languages.
- Restore 14 lyric inheritance gaps caused by those naming conventions, plus the
  catalogue's `Opeation Fake Waves` typo. That spelling exception uses only the
  verified recording IDs, rather than fuzzy matching unrelated titles.
- Magic Theorem's native instrumental runs **0.368917 seconds later** than its vocal
  at the same music. Switching and borrowed lyric cues now use that measured clock.
- Replace the limited timing table with 144 measured recording relationships:
  130 native constant-offset pairs and 14 YouTube-only relationships (including
  the four Mirairo Rider languages). Preserve the existing Speed of Light short
  edit's section mapping and explicitly restart switches between its different edits.
- Calibrate 298 native-to-YouTube upload clocks independently. For example, Feels'
  upload has a roughly 10-second video intro, which must not move native lyrics.
- Remove newly identified opening credits, including Director, Performed by,
  Production, 曲 and OP/SP, without removing later sung lines containing colons.
- Repair readers of older published content too: borrow an existing vocal lyric
  sheet when the old instrumental metadata says there are no lyrics, and strip
  old credit arrays when loading them. No new content publication is required.

## Recording measurement

Download the official native audio through the Monster Siren song API and the
catalogued public YouTube uploads. Decode to mono 12 kHz float PCM. Compare backing
music at 18 positions across the recording, using eight-second windows, raw and
frequency-filtered correlation and a ±30-second search. Reject low-energy windows,
unstable offsets, insufficient coverage and invalid normalized correlation.

All 131 native pairs were investigated: 128 raw matches, two independently resolved
with normalized log-band spectral matching (Rock the Night Away and Follow Your
Heart), and one different edit (Speed of Light). The existing 18 native offsets
agreed within one millisecond and were retained. Durations are measured from each
recording, not inferred from the difference in their endings.

The registry's first tuple is `[vocal ID, instrumental ID, vocal minus instrumental
seconds, vocal duration, instrumental duration]`; its upload tuples are `[YouTube
ID, native CID, native minus upload seconds, native duration, upload duration]`.
A switch adds the source upload correction, applies the native pair correction,
and subtracts the destination upload correction. Borrowed lyric cues use the same
projection. Independent instrumental lyric files retain their own native clock.

The complete local PCM/model cache is ignored by Git. The evidence register retains
IDs, measurements, confidence and the registry SHA-256, without redistributing
music or lyric text. These are measurements of the recordings retrieved on the
audit date; a replaced upload requires remeasurement.

## Lyric sampling: evidence and remaining work

**This is machine-assisted sampling, not a completed manual listening review and
not verification of every lyric line.** All 184 vocal sheets were examined; 183
have timestamps and one (奔赴, CID 953948) contains 23 untimed lines.

For each timed sheet, sample an opening, middle and ending phrase using two
methods: independent speech recognition with word timestamps and acoustic
alignment using the expected text. Use a 30-second context for uncertain short
clips, and prefer clear phrases over repeated ad-libs. The two methods may select
different phrases in the same region. Model implementation:
[MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper).

The evidence register records support in all three sampled regions for 92 sheets,
at least one uncertain region for 91 sheets, and one untimed source. These are
sample outcomes, not whole-sheet pass/fail results.

The evidence register distinguishes supported samples from uncertain regions.
A supported region is evidence for that sampled phrase only. Recognition failures,
foreign languages, instrumental gaps, elongated opening words and repeated phrases
make many samples uncertain. A first word can be aligned across preceding music;
its raw start is not a trustworthy lyric offset. Full-recording recognition of
Everythings Alright, for example, confirmed cues near 23.3, 113.2 and 212.4 seconds
that a short clip had failed to recognize.

No individual LRC timestamps were rewritten from uncertain recognition. The
remaining uncertain regions still need listening or stronger independent evidence;
they must not be presented as passed or as confirmed timing defects. The measured
recording-clock corrections above are independent of this uncertainty.

## Explicit exceptions

- Mirairo Rider's instrumental has four possible vocal languages. Pair timings are
  measured, but automatic lyric borrowing/version selection remains ambiguous;
  do not silently choose a language.
- Speed of Light's short instrumental is a rearranged edit, not a constant shift.
- 奔赴 has no source timestamps; keep its text unsynchronized.
- Six YouTube audio streams could not be retrieved through the tested public
  formats: `yePu2PO-YY0`, `jnWxeEfm1DU`, `UHQQAAHPGpg`, `Yvlbclnt77o`,
  `9fvhb933ZUE`, `ZIOtQKP4SE0`. This is a retrieval limitation, not a claim that
  viewers cannot play them. Do not invent upload offsets for them.
