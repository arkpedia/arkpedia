# Account-import relay domains

The browser's relay addresses are declared in [the app configuration](../../config/relay.json).
Production uses the relay's Worker endpoint. Native Preview uses
`wss://preview-relay.arkpedia.net/wisp/`, the custom hostname attached to the same
Cloudflare Worker.

The [relay repository](https://github.com/arkpedia/arkpedia-relay) owns the Worker,
site-origin and destination policies, and deployment probes. Verify each site's
configured endpoint with its own origin. Use the relay's synthetic probe for
verification without sending account credentials.

See [account-import transport](account-import-transport.md#preview-relay-hostname)
for the Preview hostname and [Vercel retirement](vercel-retirement.md) for hosting
history and application recovery.
