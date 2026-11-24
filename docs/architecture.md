# How Arkpedia works

Arkpedia's public app runs on Cloudflare Workers through OpenNext. The checked-main
production workflow owns application releases to `www.arkpedia.net`. Native Preview
has its own Worker, cache, queue and accounts at `preview.arkpedia.net`.

## Application and page registration

Next routes live in `pages/`. Each page's adjacent `.route.json` declares its release,
sitemap, navigation and request clock policy. The app, release tools and route tests
read the same page declarations. Feature components and CSS modules live together.
See the [repository map](repository-map.md) and [design system](development/design-system.md).

## Content and artwork

The nightly Arkpedia Data import prepares upstream records on `imports` at pinned
revisions. The private app compiles those records with current reviewed source.
A release pins its compiler, records and asset revisions. After publication checks
pass, Arkpedia Data moves `live/current.json` to that immutable release. Page data
can update independently of the application deployment.

The image, skin, voice, SD and L2D repositories own their media. The release pins
their revisions, and the asset delivery layer serves them from Cloudflare. See
[runtime content](development/runtime-content.md) and the [repository map](repository-map.md).

## Accounts and delivery

The edge Worker forwards requests to the site Worker. Shared HTML caching is an
explicit policy for eligible public routes. The site reads the release for page
data and uses D1 for account and community writes. Production and Preview have
separate D1 databases, credentials and sessions. The account-import relay is a
separate service for game-server requests. See [Cloud accounts](development/cloud-accounts.md)
and [account import transport](development/account-import-transport.md).

## Release and recovery

[Release execution](development/release-execution.md) covers exact-source checks,
Preview identity, application publication and live verification. Cloudflare version
recovery restores code while retaining stored user data. See
[Vercel hosting retirement](development/vercel-retirement.md) for the recovery path and
the [October 2026 architecture snapshot](archive/architecture-2026-10-25.md) for migration history.
