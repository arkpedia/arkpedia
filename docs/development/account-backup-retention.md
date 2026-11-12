# Account recovery backups: maximum 30 days

Maintainer decision: 2 November 2026. Applies to Arkpedia-operated recovery copies of
account records, private saves, pull archives, auto-deploys and community contributions.
This does not expire active accounts or users' own downloaded exports.

Account data lives in Cloudflare D1. Recovery uses managed Time Travel, not scheduled
SQL exports or an R2 archive. Cloudflare documents automatic rolling retention of
30 days on Workers Paid, or 7 days on Free; this is not a per-database setting that
Arkpedia can extend by changing a configuration value. Both satisfy the public
"up to 30 days" maximum. A new database has only its existing history, not 30 days
of pre-creation restore points.

Source: https://developers.cloudflare.com/d1/reference/time-travel/

The Preview workflow checks a real recovery bookmark with the dedicated D1 token
before migrations. It saves only the bookmark and fixed database identity in the
runner's private temporary directory, never account rows or tokens in artifacts.
The code/build artifacts retained by Actions are not account-data backups.

Operational rules:
- Keep recovery access restricted. Never use backups for normal account access.
- Do not add durable database exports without explicit expiry of at most 30 days,
  including replicas, object versions and operator copies. Prefer managed recovery.
- Account/category/community deletion removes the active data immediately through
  the existing deletion APIs; the managed recovery history expires automatically.
- A code rollback must preserve subsequent database writes. A database restore is
  a separate, exceptional recovery action, never part of automatic deployment rollback.
- Before serving a restored database, reconcile deletions and consent withdrawals
  since its restore point. If these cannot be established, keep the affected data
  unavailable; never silently republish a withdrawn support listing or contribution.

No independent database-export job was found in the application workflows reviewed
on this date. The policy does not certify unknown manual copies outside this system.
