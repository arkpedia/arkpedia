# Discover's YouTube likes

`/api/music/youtube-likes` reads `YOUTUBE_API_KEY` only on the server. Enable YouTube Data API v3
for that Google Cloud key and set the variable on each Vercel project that serves Music,
including the dev project. For local work, use the ignored `.env.local`. No visitor login is needed.

The endpoint reads video IDs from the published Discover catalogue, falling back to the bundled
catalogue without a release. It accepts no user-supplied IDs. Requests use batches of 50 and ask
only for each upload's ID and like count. A process shares concurrent refreshes and caches a
complete snapshot for a day; Vercel's edge caches for the remaining portion of that day.

A failed refresh retains the previous snapshot, with its original date, for at most seven days
and retries after five minutes. Failed batches never replace the snapshot with partial data.
Private/deleted videos, hidden counts and songs without a linked upload have no count; a reported
zero is still zero. Errors and credentials never reach the client. Counts are runtime data and
are not committed into immutable content releases or Git history.

Discover lists each upload once in Most liked on YouTube and reuses its album cover tiles,
ScrollRow and Show all grid. A tile plays immediately. Search/facet results keep the ordinary
song actions and offer Most liked on YouTube ordering (`?sort=likes`), with unknown counts last
and ties retaining search relevance. Each number is for the linked upload, with no totals across
alternative uploads or popularity score. If the API is unavailable, ordinary browsing and
playback remain available and the chart shows an unavailable message.

Checks: `node_modules/.bin/tsx --test scripts/tests/test-youtube-likes.ts` and
`tests/browser/music-youtube-likes.spec.ts`. The browser tests intercept only the likes endpoint
with explicitly synthetic counts; live API verification is separate.
