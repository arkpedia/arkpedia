# November 6 release execution audit

The video release eventually worked, but avoidable implementation failures and slow
agent handoffs made it unacceptable. The last CN-filter change alone spent more than
26 minutes outside its Check run and production deployment. CI runtime does not
explain those delays.

Scope: `arkpedia/arkpedia` through main `0fd18a2b49e0`, content publication in
`arkpedia/arkpedia-data` at `a98359406c75`, and the served video journey on
`https://www.arkpedia.net`. This is a focused release audit, not an organization-wide
freshness audit. Evidence was inspected on November 6, 2026 (UTC).

## Measured final handoff

| Boundary | UTC evidence | Result |
| --- | --- | --- |
| PR 965 opened | 16:26:10 | Frozen source `2038e8ab2a23` |
| Check | 16:26:14–16:53:15 | 2,665 application and 1,979 browser tests passed |
| Merge | 17:02:28 | Agent delay after green: **9m 13s** |
| Production release | 17:02:51–17:06:37 | Automatic owner succeeded in **3m 46s** |
| Release status | 17:12:06 | Healthy, exact current main, 4/4 HTTP checks |
| Final browser screenshot | 17:24:26 | Linked video visible without CN opt-in |

The browser proof was captured **17m 49s after production completed**. Some verification
was necessary; this duration was not. Manual polling, repeated status updates and
unrelated investigation did not advance the release. The agent also dispatched one
Preview with an abbreviated SHA and tried generated hostnames instead of the documented
public Preview domain. Those were execution errors, not infrastructure failures.

Evidence: [PR 965](https://github.com/arkpedia/arkpedia/pull/965),
[Check](https://github.com/arkpedia/arkpedia/actions/runs/42252358498),
[production](https://github.com/arkpedia/arkpedia/actions/runs/42257988564),
[successful Preview](https://github.com/arkpedia/arkpedia/actions/runs/42252493246),
[invalid abbreviated-SHA request](https://github.com/arkpedia/arkpedia/actions/runs/42252364025).
The local proof is `.cache/youtube-discovery/production-cn-included.jpg`; its filesystem
timestamp establishes capture time, while its pixels and browser state establish the result.

## Handoffs and findings

| Producer | Consumer | Contract and observed state |
| --- | --- | --- |
| App PR / ordinary Next browser build | Production OpenNext Worker | **Broken premerge coverage:** production bundle errors were discovered only after merge. The real production build is now added to Check; live CI exercise is pending. |
| Preview upload | Public Preview | **Broken success criterion:** upload success did not establish which build the public domain served. A bounded exact-identity check is now added; live workflow exercise is pending. |
| Hydrated game records | Standalone video producer | **Verified repaired on main:** local context no longer requires the not-yet-generated derived stage catalogue. A clean-input subprocess regression passed in Check. |
| Archive producer | Immutable content release | **Verified repaired on main:** `data/youtube-discovery.json` participates in source hashes; query bookkeeping remains in cache. Archive-only changes alter the release input. |
| Published archive / RSS | Cached World and homepage | **Verified working:** archived MT guides appeared while app source remained `fe4e54613`; live single-slot creator rotation was observed before the later CN-filter deployment. |
| Green Check / deployed source | Agent merge and acceptance | **Execution failure:** unnecessary gaps persisted despite successful workflows. The release execution instructions now require direct handoffs and bounded, scoped acceptance. |

Earlier concrete failures:

- [Production 42232131651](https://github.com/arkpedia/arkpedia/actions/runs/42232131651)
  failed building the Worker: local catalogue imports enlarged it to 18.96 MB over
  the existing 18 MB budget. PR 963 isolated Node-only source fallbacks; the next
  production build was 17.47 MB. The budget was preserved. The missing control was
  running that actual production build before merge.
- [Content preparation 42236164629](https://github.com/arkpedia/arkpedia/actions/runs/42236164629)
  failed in the current-video producer after hydration. The required derived stage
  catalogue was absent. PR 964 made the standalone producer consume canonical stage
  inputs and added clean-input coverage. This was not a Node-version or alias problem.
- NAS temporary storage filled during the wider release. Disk-backed `TMPDIR` was
  repaired in Check/content preparation; Preview and production build jobs now use
  the same storage choice.

## Repair and verification boundary

The new safeguards preserve the production owner, credentials, account databases,
schema, bundle ceiling and release authorization gates. No DNS, visibility, database
or public-history change belongs to this repair. The CN-filter release is already live.

Local regressions exercise short-SHA normalization, refusal of dirty/unpublished
Preview sources, staging/production identity separation, propagation retries and
workflow ordering/permissions. The PR must additionally exercise its new production
build job and Preview identity step before these additions can be called verified
in CI. Source instructions can reduce agent mistakes; they do not guarantee future
agent timing or make unrelated failures impossible.
