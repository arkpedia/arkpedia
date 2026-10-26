# Music workspace

The 2026-10-25 redesign uses [Navidrome](https://github.com/navidrome/navidrome/)
and its [public demo](https://www.navidrome.org/demo/) as interaction references:
separate collection navigation, artwork-led browsing, readable track lists and a
persistent player. Arkpedia keeps its own components, colours, typography and playback
engine. No Navidrome source, assets, server, database or music-upload service is included.

## Reader experience

- Discover, Library, Now playing, Queue and Favourites share a desktop navigation rail.
  Narrow screens use a horizontally scrollable menu with the same destinations.
- Playlists live under Your collection. Saved playlists have direct shortcuts to the
  existing playlist editor; import, export, saving a queue, undo and playback remain available.
- Discover retains album, character, story and artist browsing, progressive collections,
  search and YouTube popularity. Desktop artwork has more room.
- Library and Queue use quiet, separated track rows. Playing songs remain highlighted;
  existing favourite, queue, playlist and reorder actions remain available.
- Now playing keeps artwork, credits, up next and expandable lyrics. The bottom player's
  Lyrics action opens this view and expands available lyrics; Queue remains one press away.
- The desktop bottom player separates track details, centered playback/seek and utility
  controls. Touch controls retain the existing responsive arrangement and measured clearance.

## Continuity and data

Navigation remains URL-addressable and shallow between `/music` views. Favourites uses
`/music?view=library&scope=favorites`; browser history restores that filter. Existing library
search and list scroll survive view changes because the views remain mounted and inert
while hidden. Browsing never replaces the playing queue.

The same global player owns YouTube and Monster Siren playback. The workspace does not
change audio-source selection, autoplay, resume, cloud-save formats, playlist formats,
favourite storage or external-media consent. There are no new services or operating costs.

Playlist dialogs render outside the sticky rail so page content and the transport cannot
cover their controls. The player still measures its rendered height to reserve space in
each view rather than relying on a guessed footer height.

## Verification

`music-workspace.spec.ts` covers the Favourites shortcut and browser history, uninterrupted
playback through Lyrics navigation, and saving a playlist through the rail overlay in both
themes on desktop/mobile. Existing navigation, queue, lyrics, playlist, source and resume
checks remain the regression coverage for the preserved engine. Final run results are
recorded in the pull request; this document does not assert a production release.

Local verification on 25 October: the 96-case music run passed 71 cases with 23
intentional skips and two desktop setup failures. Both failures passed in the
individual rerun, alongside header-help placement and repeated Lyrics access
(five passed, one intentional skip). TypeScript, targeted ESLint and both style
audits passed. Desktop/mobile dark/light screenshots were inspected, including
the populated player and short-screen playlist access.
