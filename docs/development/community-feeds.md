# Community feed credentials

The homepage, Community Hub, `/community/twitch`, `/community/youtube-live`,
`/community/videos` and search feeds use server-side feed readers. These credentials
are independent of Google/Discord account sign-in and external playback permission.

Required credentials:

- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`: a Twitch Developer application.
  The existing reader exchanges these for an app access token using the client
  credentials grant, then reads the public Arknights category. No viewer OAuth
  permissions are needed.
- `YOUTUBE_API_KEY`: a Google Cloud key with YouTube Data API v3 enabled and an
  API restriction to that service. It enriches public channel feeds with live
  status and supplies the separately cached music like counts.

Keep values out of Git, chat, public variables and browser props. Local development
uses ignored `.env.local`. The existing Cloudflare `arkpedia` Worker uses encrypted
runtime secrets with the same names (`wrangler secret put NAME --config
wrangler.jsonc`). Do not put production credentials into arbitrary PR previews.
Do not rotate or replace a shared provider credential without checking its users.

The community pages revalidate every 1,500 seconds. Adding secrets does not rewrite
an existing cached page immediately. Check a fresh runtime API response, then verify
the homepage and community pages after revalidation; a configured secret alone is
not proof the feed works. Music likes use their own daily cache.

Acceptance checks:

- Confirm the three secret names exist without printing their values.
- Validate Twitch's app token and Arknights category/streams responses.
- Validate YouTube `videos.list` with known curated-channel video IDs, including
  live status; distinguish no current live streams from an API failure.
- Verify `/api/search-feeds` returns public feed data only and
  `/api/music/youtube-likes` can obtain its public count snapshot.
- Check the homepage, Twitch, YouTube live and video pages in the deployed browser.
- Confirm keys are absent from HTML, page JSON and browser network requests.

Sources: [Twitch app authentication](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow)
and [YouTube Data API setup](https://developers.google.com/youtube/v3/getting-started).

## Configuration verified 25 October 2026

The maintainer approved creating the confidential Twitch application **Arkpedia
Community Feeds**, enabling YouTube Data API v3 and its terms in the existing
**Arkpedia** Google Cloud project, and creating **Arkpedia Community YouTube** with
an API restriction to YouTube Data API v3 only.

All three credentials are configured as encrypted secrets on the existing Cloudflare
`arkpedia` pilot Worker and in this worktree's ignored `.env.local`. They have not
been added to isolated PR previews or Vercel, and no account-login configuration,
DNS, billing or application-code deployment was changed.

Live checks passed for Twitch authentication/category/streams and YouTube video
metadata. The pilot and local preview both returned 12 live Twitch streams and a
1,125-video music-like snapshot. The pilot listed 45 community videos; its configured
YouTube live page reported no curated channels currently live. The pilot homepage
was also verified in the browser with its live Twitch panel after ISR/front-cache
refresh. These are observations at verification time, not fixed feed counts.

Checked public page/API responses did not contain any of the credential values.
The provider key list confirms the YouTube-only API restriction. Keep raw credentials
out of this document and all screenshots used as public evidence.
