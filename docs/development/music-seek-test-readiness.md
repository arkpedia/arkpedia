# Playback-position regression test readiness

The full Check for PR #738 failed at `music-data-saver.spec.ts` when switching
YouTube playback back to the audio engine: the sampled audio time was zero, despite
the request having been sent and `paused` already being false.

Diagnosis against the unchanged Cloudflare pilot, with both media providers mocked:

- Unmodified case: four serial runs passed.
- Add an 1800ms delay to the returning mocked audio file: two runs failed at the
  exact existing lower-bound assertion with `currentTime === 0`.
- With the delay retained, wait for decoded current data and no active seek before
  sampling: two runs passed the full existing case, including both position bounds.

The engine already keeps a pending seek until metadata arrives. Calling play can
clear `paused` before that seek is applied. The test now waits for actual media
readiness and keeps the original lower and upper position bounds unchanged. It
does not retry the test, increase tolerances, skip coverage or modify player code.

Polling the position until it exceeds the expected lower bound would be weaker:
a real restart at zero could eventually enter that range. Waiting for decoded
data and seek completion samples the resumed position instead. The explicit slow
file keeps this regression reproducible.

This fix was kept separate while accounts PR #740 completed its pilot. It is now
included with PR #738's release-review tooling. It changes the browser test only;
the shared player source and accounts implementation are unchanged.
