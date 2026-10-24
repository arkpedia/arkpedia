# Documentation

- [System architecture](architecture.md): diagrams of website delivery, edge caching, relay imports, assets, data publication and releases.
- [System simplification plan](development/system-simplification-plan.md) and [progress](development/system-simplification-progress.md): migration milestones and verified evidence.
- [Cloudflare staging](development/cloudflare-staging.md): isolated feature-preview proof and commands.
- [UX review](development/ux-review.md): complete journeys, state coverage and evidence required for UI changes.
- [Release status](development/release-status.md): one read-only report for www, dev and Cloudflare.
- [Repository map](repository-map.md): ownership, feature locations, and placement rules.
- [Development setup](development/setup.md): local development, checks, and deployment.
- [Design system](development/design-system.md): page patterns, cards versus lists, responsive behavior, and the site-wide route inventory. Start here for UI work.
- [UI primitives and tokens](development/ui-primitives.md): exact tokens, shared component APIs, and the migration ratchets every page change follows.
- [Runtime content](development/runtime-content.md): reviewed game updates without a website rebuild.
- [Data pipelines](development/data-pipelines.md): refresh stages, upstream caches, and base-skill audits.
- [Base optimizer design](development/base-optimizer.md): the chronological base simulator, and the optimizer and page planned on it.
- [Data sources](development/data-sources.md): source repositories and provenance.
- [Data catalogue](../data/README.md): game datasets and generated payloads.
- [Scripts](../scripts/README.md): tooling directory map and commands.

For the current Cloudflare pilot, run Worker-specific setup and staging commands
from `cloudflare`. Those configurations have not yet been consolidated onto `main`;
the architecture diagrams distinguish this from Vercel production.

## Feature references

- [Operator details](features/operator-details.md)
- [Recruitment Guesser](features/recruitment-guesser.md)
- [Stage Guesser](features/stage-guesser.md)
- [Music Guesser](features/song-guesser.md) and [coverage](features/song-guesser-coverage.md)
- [Games foundation](features/games-foundation.md)

[Archived reviews](archive/README.md) record earlier investigations and preview designs. They are retained for context, not instructions for the current UI.
