# Rotation calculator

`calculateRotation` recalculates saved shifts with `simulateBase`, the account optimizer's chronological engine. It reports the repeating cycle after morale settles, integrates storage and morale thresholds between logins, and collects at login and shift boundaries. A partial final login window keeps its actual duration. Each shift supplies its saved clue, dorm, training and workshop settings; staffing rotations must retain the same room layout and levels.

LMD and gold sold use `sustainableOutput`: produced gold plus the timetable's outside-gold allowance funds trading. Gold-free LMD remains independent. Ramping skills retain the simulator's documented approximations; drones, crafts and training are excluded from production. If morale does not settle within the simulation budget, the last cycle is shown with a warning.

Use as rotation saves shift presets, activates Rotation calculation, and loads the first shift as an editable planner copy. Imported account data is unchanged. Calculator source and collection interval persist separately from the timetable. Current base settings edit the draft; each rotation shift uses its saved settings. Edit rotation / View in base allows a saved shift to be edited.

The summary and timetable stages use the same reported simulation cycle. Missing presets and incompatible layouts produce an unavailable result, rather than falling back to current-base output.

Checks: `node --import tsx --test scripts/tests/test-base-rotation-production.ts scripts/tests/test-base-simulation.ts`, plus the base optimizer browser suite's recommendation-to-calculator equality and reload checks.
