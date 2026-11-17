# Homepage official broadcasts

The Events carousel also features official Arknights CN, JP, Global and KR streams,
and Endfield Global patch programmes/premieres, scheduled within seven days.
Ordinary Endfield community uploads remain excluded. Sources and their provenance
are fixed in config/official-broadcast-sources.json. Endfield's YouTube channel is
resolved from two videos embedded on its official website and checked for agreement.

Regional streams group only through explicit anniversary editions, Endfield versions
or shared canonical event names in the shipped regional schedule. Generic titles
and nearby times do not merge unrelated programmes; CN is its own release family.
The earliest regional stream is featured. Live confirmation keeps it featured until
the provider reports it ended; the next stream then takes over. Global wins an
identical-time tie with KR for a new selection. A stream already featured as live
stays selected even if a same-time regional stream reports its live status later. Other regional watch/replay links and local times remain
below the hero. All-ended groups leave the carousel.

GET /api/home/broadcasts exposes public metadata only. It reuses the existing
server-side YOUTUBE_API_KEY and page-cache R2 bucket, with a conditional global
refresh lease. No new secret is needed and Preview receives no production secret.
YouTube upcoming/live searches run at most every six hours (four channels, two
searches each: 3,200 search units/day). At most 12 IDs per channel are retained and
verified together with videos.list. Provider errors back off. Stream status refreshes
every 30 seconds near start/while live, otherwise five minutes. Bilibili room 5555734
must have official UID 161775300 and live_status=1; replay status 2 is never Live now.
Scheduled timestamps come only from explicit provider fields.

The browser polls every 30 seconds and on tab return/focus, never promoting a
scheduled stream to Live merely because its start time passed. Unconfirmed live
state expires after 90 seconds; errors remove client live entries. Existing game
event slides remain available during loading/errors. The first server/client paint
is unchanged, so credential-dependent discovery cannot delay static rendering.
