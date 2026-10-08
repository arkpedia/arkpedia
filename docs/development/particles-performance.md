# Particle CPU performance follow-up

The restart of prewarmed loops during Hoshiguma the Breacher’s Touch animation used to do every warm-up step in one frame. This change prepares eligible systems before their known switch-on, preserves the finite-difference noise field while evaluating its gradient directly, and reduces repeated vertex writes.

## Measured peak window

Fixed 60 fps simulation, Touch at 20 s, 150 measured frames from animation time +10.0 to +12.5 s; three fresh Chromium runs per condition. The CPU number is simulation plus vertex expansion and buffer upload. Drawing and software GL rasterisation are excluded. The harness is cross-origin isolated. The input is the same Hoshiguma P6 export as the earlier recording checks.

Each number below is the median of three runs. Raw per-frame timings and live counts are in [particles-performance.json](particles-performance.json).

| CPU throttle | Code | Mean ms | p95 ms | Maximum ms |
| --- | --- | ---: | ---: | ---: |
| 1x | before | 0.963 | 1.340 | 9.520 |
| 1x | after | 0.793 | 1.120 | 2.435 |
| 4x | before | 4.121 | 5.945 | 38.565 |
| 4x | after | 3.402 | 5.060 | 10.690 |

The 4 ms **mean** budget passes in this peak window. p95 remains above 4 ms. Preparation begins up to three seconds before a predictable switch-on and advances two prewarm steps per display frame: part of the improvement in this window comes from spreading that work into earlier, less busy frames. These numbers do not claim that every frame, the entire action, or a real phone meets 4 ms. A physical phone check remains outstanding.

## Output and fallback checks

- Existing simulator and vertex golden fixtures pass; noise retains the central-difference correction and samples explicitly across lattice boundaries. The independent oracle is unchanged.
- A separate scalar reference checks noise inside cells, at negative coordinates, across each offset field’s cell boundaries, and over multiple octaves.
- A synthetic restart checks particles and live budgets on every frame at 30, 60 and 120 fps, including replay, a driven shape radius and a cap that requires synchronous fallback.
- Replay comparison covered all 96 model folders and 240,909 frames through Idle and their available actions. Live counts, activation and per-system counts matched each frame; positions, ages and seeds matched exactly at half-second samples. Folders with no particle file were accounted for separately.
- A system with a follower, sub-emitters, a looping clip, reduced motion, an incomplete preparation, or insufficient live-budget room keeps the original synchronous path. A clock change, rewind or changed simulation step discards stale preparation.

## Repeating the measurements

Use the existing P6 sweep harness with the site modules bundled from the desired checkout and the frozen model folders. Run `perf.mjs cpu --reps 3 --port <harness-port>` serially for the baseline and changed bundles, with no other local build or test run competing for CPU. Preserve the raw JSON and verify the 474–1,570 live-particle range.
