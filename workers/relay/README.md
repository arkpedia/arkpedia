# The account-import relay on Cloudflare

The site's account import runs TLS in the reader's browser (libcurl.js) and tunnels the encrypted
bytes through a [Wisp](https://github.com/MercuryWorkshop/wisp-protocol) relay to Yostar's
servers, because Yostar's token exchange and game server send no CORS headers. The relay only ever
sees ciphertext. This folder runs that relay on Cloudflare, for the site's own Worker. www and
arkpedia-dev keep the VPS relay (arkpedia/arkpedia-relay).

**Why a container:** a plain Worker can't do it. Its `connect()` sockets may not open connections
to Cloudflare addresses, and the game's Global and JP hosts (`as`, `gs`, `ak-conf`) are behind
Cloudflare. A container's own internet access reaches them; that was tested from a container on
2026-10-22.

## What's here

| File | What it does |
|---|---|
| `worker.mjs` | Terminates `wss://` and refuses everything except a WebSocket to `/wisp/` from the site's Worker, before a container wakes. It rate-limits each address and hands the connection to one container. |
| `gate.mjs` | Those decisions, and the settings the container gets (tested in `scripts/tests/test-relay-worker.ts`). |
| `container/server.mjs` | The VPS relay's Wisp server: the hosts and ports from `config/relay.json`, no raw, private or loopback addresses, no UDP, a stream limit per visitor, nothing logged. Without its settings it doesn't start. |
| `container/probe.mjs` | Checks a running relay from outside. |
| `wrangler.jsonc` | The Worker `arkpedia-relay` and its container application, also `arkpedia-relay`: observability off, one `lite` instance that sleeps after ten idle minutes, 20 requests a minute per address. |

**Settings:** all of them come from `config/relay.json`:
- `allowedHosts` (the same list the VPS relay allows);
- `cloudflare.ports`;
- `cloudflare.streamsPerVisitor`;
- the page origin, `https://<siteWorker>.<the relay's own workers.dev account>`. The account
  subdomain is never written down.

**Never set `allowedHosts`, `deniedHosts`, `interceptHttps` or outbound handlers on the
container.** They send its traffic through Cloudflare's HTTP proxy, and `interceptHttps` ends TLS
there, where the traffic could be read. The allow-list in `server.mjs` is the lock. The VPS's
systemd sandbox and iptables chain have no counterpart here. The container holds nothing but the
relay, and nothing reaches it except through the Worker.

## Deploying: Workers Builds

The relay is its own Worker, so a failed image build can't take the site Worker down. Workers
Builds builds it, Dockerfile included. Set it up once in the dashboard:

1. Workers & Pages → Create → Import a repository → `arkpedia/arkpedia`.
2. Worker name `arkpedia-relay`, which must equal `wrangler.jsonc`'s `name`.
3. Branch `cloudflare`.
4. Root directory `workers/relay`. Leave the build command empty. The deploy command is
   `npx wrangler deploy`.
5. Build watch paths: include `workers/relay/*` and `config/relay.json`.
6. Turn off builds for non-production branches. `wrangler versions upload` wouldn't update the
   container anyway.

Each push to `cloudflare` that touches those paths then builds the image, pushes it and rolls out
the container. A newly connected Worker has no build button until it has built once, so its first
build also comes from such a push. The first start after a deploy takes about 20 s while the container is placed.

**Check it after a deploy:**

```bash
cd workers/relay/container && npm ci
node probe.mjs wss://arkpedia-relay.<account>.workers.dev/wisp/ https://arkpedia.<account>.workers.dev
```

**Cost:** one `lite` instance (1/16 vCPU, 256 MiB, 2 GB disk). Memory and disk are billed only
while it's awake, and CPU only for what it uses. Asleep after ten idle minutes, a few hundred
imports a month fit in Workers Paid's included usage. Kept awake around the clock, it would be
about $1.70 a month.

**Removing it:** delete the Worker `arkpedia-relay` in the dashboard (or `npx wrangler delete`
here), then check `npx wrangler containers list` for its container application, `arkpedia-relay`.

**Renaming the container application:** wrangler finds the application by its `name` and can't
rename one. A new `name` means a new application on the same Durable Object, so delete the old
application first (`npx wrangler containers delete <id>`), then deploy. Imports through this relay
fail in between.
