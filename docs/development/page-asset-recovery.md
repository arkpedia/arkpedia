# Interrupted page loading

`pages/_document.tsx` installs `pageAssetRecoveryScript()` before the application's
styles and deferred scripts. It can recover even if React never starts.

- Same-origin `/_next/static/` stylesheets retry twice with a cache-busting query,
  preserving the link's attributes and cascade position. Successful sheets are left alone.
- A stylesheet error is tracked explicitly: browsers can expose a non-null `sheet`
  even when its request failed. Presence of that object alone is not proof of success.
- Persistent CSS failure or a failed initial deferred JavaScript file can replace the
  current history entry with a fresh document request. The existing query and hash remain.
  A session guard allows one such navigation per five minutes; the URL marker bounds
  recovery when session storage is unavailable. On arrival, the marker is removed only
  when the session guard can be stored.
- Reloads are limited to initial loading, before reader interaction, while online and
  visible. CSS can retry when the page is restored or connectivity returns. Dynamic
  scripts, third-party media, images, and healthy stylesheets cannot trigger reloads.
- Account, planner and other local storage is neither read nor cleared by recovery.

The October 31 report showed an unstyled iPhone homepage. Live probes returned valid
HTML and CSS, so the visitor's specific network/cache failure was not established.
Browser regression tests reproduce failed stylesheet delivery and an unavailable old
startup bundle, including WebKit, rather than claiming to reproduce the original request.

`tests/browser/page-asset-recovery.spec.ts` checks the actual built homepage with a
failed stylesheet in both themes, then uses isolated fixtures for reload bounds,
URL/storage preservation, offline recovery, edited pages and unrelated resource errors.
