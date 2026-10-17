# Account import transport

The installation-free importer saves a successful sign-in locally by default. The reader can
check “Don’t save this sign-in on this browser” to keep it in memory for that import only.
Saved credentials include their server, so reopening the dialog selects the same region and
shows Import, Request code and Forget everything. Request code sends to the saved email on its
own server without importing or changing the saved login. Rejected saved credentials return to
email login; choosing a different server shows that server's email login. Backups exclude
sign-in credentials. Forget everything confirms the full scope, clears local/session storage,
retires active state in open tabs and reloads; it includes every account, manual progress,
playlists and preferences.
Its WebAssembly TLS session connects to the real
provider through the Wisp relay; the relay carries encrypted bytes and cannot read the requests.

| Request | Route | Reason |
| --- | --- | --- |
| Public game server list (Global, JP, KR) | Browser → `/api/account-import/network?server=…` | Public metadata is shared through a 60-second server cache and 60-second CDN cache. |
| Public game version | Browser → provider | These version hosts allow cross-origin browser reads. |
| Email code and SDK sign-in | Encrypted relay | The SDK rejects website Origins in its actual response, even where OPTIONS advertises CORS. |
| Game token, login and account sync | Encrypted relay | The game hosts do not grant the website browser access. |
| Account Center login and pull history | Encrypted relay | The API lacks browser access and uses session cookies whose Set-Cookie headers are unavailable to website JavaScript. |

The metadata API accepts only a known server id and GET, reads a fixed public URL without
credentials or redirects, validates the response, and caches no failures. Concurrent reads
for the same server share one upstream request per warm function instance. Cache layers can
make a successful response up to roughly two minutes old. Version files remain fresh browser
reads. A cache failure falls back to the original public GET through the encrypted relay;
authenticated requests never change route or replay automatically after a refusal.

The progress list describes reading game server settings. Loading public settings does not
prove that an encrypted relay connection has opened. Sending a code and verifying a code are
independent: a reader can try a code already received without requesting another email.
The saved sign-in also avoids new code requests on later imports.

## Provider and capacity limits

On 2026-10-17, harmless empty-body SDK validation requests from the production browser Origin
returned `客户端参数有误:cors error` for Global, JP and KR. The same validation without a website
Origin reached normal missing-field checks. Public server-list responses also lacked CORS
permission. Preflight headers and mocked transports alone cannot establish browser support;
see [browser CORS rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) and
[Set-Cookie restrictions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

An observed Global code-delivery refusal, alongside successful delivery through the official
Account Center, establishes a difference between those routes. It does not establish whether
the limit is per account, IP, client, or a combination, nor whether an Account Center code is
accepted by the SDK. Fixture tests do not answer those provider questions.

Adding relays can spread concurrent traffic and provide another failure domain. An import
would need to stay assigned to one relay for its entire session; do not rotate routes and
replay an email-code request after the provider refuses it. Only one production relay is
currently configured. Public metadata caching reduces that relay's traffic but cannot
promise to resolve a provider's email-code quota. The relay's nginx request limiter counts
WebSocket openings, not encrypted email-code requests inside a tunnel.

## Regression coverage

`test-account-import.ts`, `test-import-public-network.ts` and the desktop/mobile
`account-import.spec.ts` cover protocol routing, cache coalescing/expiry and failures,
server isolation, invalid API input, existing-code recovery and no automatic resend.
Browser account responses are fixtures; no test sends a real email or signs in to an account.
