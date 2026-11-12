# Music likes

Discover ranks tracks by Arkpedia favourites. The existing daily community-statistics cron also calls `/api/music/likes` with a UTC-day capability specific to the music chart. It counts each catalogue track once per participating account and atomically publishes the totals to `music-charts/v2/favourites.json` in the private page-cache bucket. Visitors read that snapshot. A failed build leaves the prior snapshot in place for up to two days.

Participation is off by default. The account must sync personal settings and enable **Contribute to community stats** in Account settings → Community sharing. Removing a favourite, withdrawing, pausing personal sync, or deleting a save affects the next successful daily build. The published chart contains only catalogue IDs, counts and the build time.

The next shelf ranks the linked uploads by YouTube likes. Discover reads the cached counts from `/api/music/youtube-likes`. This chart refreshes independently of community sharing and supports the same song ordering in search and album results.
