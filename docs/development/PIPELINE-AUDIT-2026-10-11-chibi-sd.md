# Chibi SD migration — 2026-10-11

Scope: the website's existing chibi catalogue, its SD repository, and the content release handoff. This does not migrate unrelated stage render images, animated illustrations, voices, or simulator asset sources.

The production Amiya page, served by application commit `13f957f54925488d2c7006569ce1176b10890509`, carried SD URLs for its default battle facings and upstream `fexli/ArknightsResource` URLs for base/walking models and skin facings. The old generator rebuilt those upstream URLs from a source tree. The new generator accepts only complete models named by SD's `websiteSkins` catalogue.

| Handoff | Result |
|---|---|
| Pinned upstream → SD files | 2,128 models imported, all files independently match original Git blob hashes |
| Existing SD catalogue | All 831 previous records unchanged; 2,959 complete model entries after import |
| Native animation parsing | All 2,128 imported skeletons parse; 17,458 clips; no missing atlas regions |
| SD manifest → website index | Exact 1,378 skin IDs and 4,068 skin/facing bindings retained; 12,208 file references point only to SD |
| Alpha blending and texture labels | Unchanged for every website binding |
| Future published SD revisions → content refresh | Fingerprint watches SD; `chibi-art` stage reads one commit-pinned manifest; partial coverage retains the previous index |
| Release validation | Rejects upstream chibi URLs and mixed SD commits before publication |

Assets are pinned to SD commit `456cb5aaa3888d8af92966a5b955657ee0d065a7`. The source files remain byte-identical, including original atlas formatting. Shared model aliases and absent facings remain as they were; no alternate skin or operator was substituted. Importing an existing CN-facing reference changes no operator release/availability metadata.

The asset commit must be available before the website update is adopted. Development integration, a published content release, and production promotion each need their own verification. Local tests establish the transformation and failure handling; they do not establish hosted delivery. New upstream model discovery remains an explicit import/mapping step in SD assets.
