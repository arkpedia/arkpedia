/*
 * What's new on the site (pages/changelog.tsx), newest first, in the reader's words: what
 * they can now do, what works differently, and what was broken and is not. Each item a short
 * title and at most one short sentence (ChangeItem). Written at each
 * release to the main site, for what that release brings. Not every merge: tests, CI and
 * internals stay out (scripts/tests/test-changelog.ts holds the shape).
 *
 * Releases may be added independently: groupChangelogDays automatically combines their
 * items under one date in the reader's timezone, retaining the newest release timestamp.
 */

/** One change, scannable: a headline that is the point on its own, and at most one short sentence
 *  under it. The page shows the title bold, the detail quieter; scripts/tests/test-changelog.ts
 *  holds both to a length, so the page stays a list to skim, not a wall of text. */
export interface ChangeItem {
  /** The point in a few words: "Pull History", "Every event reward, not just the store". */
  title: string;
  /** One short sentence of what it means for the reader, when the title needs it. */
  detail?: string;
  /** A page on the site the change is about: the title links to it. */
  href?: string;
}

export interface ChangelogEntry {
  /** When the release reached the site, as a UTC instant ("2026-10-05T08:26:00Z"): one moment
   *  for every reader, which the page shows in each reader's own time zone (LocalTime). */
  at: string;
  /** A short name for the release, when it has a theme. */
  title?: string;
  added?: ChangeItem[];
  changed?: ChangeItem[];
  fixed?: ChangeItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    at: '2026-10-19T04:10:00Z',
    added: [
      { title: 'Search the whole site', detail: 'Press Ctrl+K (⌘K on a Mac), "/" or the magnifier in the top bar to find operators, events, stages, enemies, albums, songs and pages as you type.', href: '/search' },
      { title: 'Search Arkpedia from your browser', detail: 'Add Arkpedia as a search engine, or open arkpedia.net/?s= followed by a name to jump straight there.' },
    ],
  },
  {
    at: '2026-10-18T14:10:00Z',
    changed: [{ title: 'Direct music playback', detail: 'Songs play straight from Monster Siren while the player prepares the next track as you listen.', href: '/music' }],
  },
  {
    at: '2026-10-18T05:00:00Z',
    changed: [{ title: 'Smoother song transitions', detail: 'The player prepares the next audio track while you listen, following your queue and shuffle order.', href: '/music' }],
  },
  {
    at: '2026-10-18T04:41:29Z',
    fixed: [
      { title: 'Rerun event details', detail: 'Reruns use their own outfits and rewards; Relaunch Anchor has a full page, and expired banner estimates show as unannounced.', href: '/schedule' },
    ],
  },
  {
    at: '2026-10-18T04:00:00Z',
    added: [{ title: 'Private connection diagnostics', detail: 'Copy a login-free report after an import connection fails to help identify where it broke.', href: '/account' }],
  },
  {
    at: '2026-10-18T03:00:00Z',
    fixed: [
      { title: 'More reliable email-code requests', detail: 'Failed connections retry once; clearer errors and a resend countdown help avoid duplicate requests.', href: '/account' },
    ],
  },
  {
    at: '2026-10-17T01:46:30Z',
    changed: [
      { title: 'Simpler account imports', detail: 'Sign-ins and regions are saved on this browser by default, with an opt-out; next time, choose Import.', href: '/account' },
      { title: 'Request a code with a saved sign-in', detail: 'Request code emails your saved address without importing, so you can use the code to sign in to the game.', href: '/account' },
      { title: 'One button to forget everything', detail: 'Forget everything clears all accounts, sign-ins, planner edits, story progress, music data and preferences on this browser.', href: '/account' },
      { title: 'Pull history opens on request', detail: 'Choose Every pull to load individual pulls; totals, banner summaries and CSV export stay available.', href: '/account' },
    ],
    fixed: [
      { title: 'Import with a code you already received', detail: 'The code field stays available if sending an email fails, with a clearer message for email limits.', href: '/account' },
    ],
  },
  {
    at: '2026-10-16T16:23:28Z',
    added: [
      { title: 'Japan and Korea schedules', detail: 'Events and banners use their own server schedules when you select a Japanese or Korean account.', href: '/schedule' },
    ],
    fixed: [
      { title: 'Server resets and timed rewards', detail: 'Farming stages, banners, events, shops and timed rewards follow the selected account’s server clock.', href: '/account' },
    ],
  },
  {
    at: '2026-10-16T06:18:30Z',
    added: [
      { title: 'Operator previews in recruitment', detail: 'Select a recruitment result to see artwork, stats and skills in a popup without leaving your results.', href: '/recruitment' },
      { title: 'New story chapters', detail: 'The story library includes the expanded reader catalogue with chapter artwork and preserved reading progress.', href: '/story' },
      { title: 'Episode 17 stages', detail: 'Browse Episode 17 stages and their details in the stage database.', href: '/stages' },
    ],
    changed: [
      { title: 'Story library artwork and loading', detail: 'Chapter covers and Operator Record portraits are restored, with gradual list loading and lazy images.', href: '/story' },
    ],
    fixed: [
      { title: 'Imported rewards and Paradox Simulations', detail: 'Completed stages and claimed rewards import without replacing manual tracker progress; reimport to update older accounts.', href: '/free-op' },
      { title: 'Beginner reward programmes', detail: 'Beginner reward claims match the programme on the imported account.', href: '/free-op' },
      { title: 'Crossover banners under Limited', detail: 'Crossover banners appear under Limited in the gacha simulator.', href: '/gacha' },
      { title: 'Updated voice actor credits', detail: 'Operator voice credits are kept when only some languages or audio files refresh.', href: '/operators' },
      { title: 'Chapter 16 and 17 story covers', detail: 'Both chapter popups show their story artwork, including the correct cover for Chapter 17.', href: '/story' },
    ],
  },
  {
    at: '2026-10-15T11:16:00Z',
    added: [
      { title: 'Live and upcoming banners on the home page', detail: 'Banners running now say LIVE, the next one says when it starts, and one without art yet shows a placeholder.', href: '/' },
      { title: 'New guide videos every day', detail: 'Operator pages pick up new guides from trusted YouTube creators daily, and older operators got theirs too.', href: '/operators' },
    ],
    fixed: [
      { title: 'Account sign-in', detail: 'Restored the previous email-code login flow while keeping the notice about which Yostar email to use.', href: '/account' },
      { title: 'Broken operator icons', detail: 'Icons and art that sometimes showed a broken-image "?" now load on a second try.', href: '/operators' },
      { title: 'Picture galleries on event pages', detail: 'An event with a published set of pictures, like Crossing, shows all of them instead of its poster alone.', href: '/schedule' },
      { title: '2022 events on the calendar', detail: 'The Schedule calendar shows the 23 Global events of 2022 again, which only the Events list had.', href: '/schedule' },
    ],
  },
  {
    at: '2026-10-15T01:00:00Z',
    title: 'The new music player',
    added: [
      { title: 'Discover, Library, Now playing and Queue', detail: 'One menu across the music pages; Back and Forward step between them without stopping the song.', href: '/music' },
      { title: 'Music keeps playing in the background', detail: 'Songs play from Monster Siren\'s own files, so they go on when you switch apps or lock your phone.', href: '/music' },
      { title: 'Data saver', detail: 'In the player\'s More menu: play songs from YouTube instead, which uses far less data but stops in the background.', href: '/music' },
      { title: 'Lock-screen controls and covers', detail: 'Your phone\'s lock screen shows the song, its album cover and play, pause, next and seek.', href: '/music' },
      { title: 'Every Monster Siren song', detail: 'Songs with no YouTube upload yet play too, from Monster Siren.', href: '/music' },
      { title: 'Play next and Add to queue', detail: 'Line songs up from the Library or Discover; Play now plays a song and keeps the rest of your queue.', href: '/music' },
      { title: 'Browse by album', detail: 'Every album on Discover as a cover grid, newest first or A-Z, with a filter.', href: '/music/discover' },
      { title: 'Clear the queue', detail: 'Keep only the song playing, with Undo; the queue shows what you queued and what plays after it.', href: '/music' },
    ],
    changed: [
      { title: 'The player follows you', detail: 'The song stays at the bottom of every music view, and a compact player sits in the corner on other pages.', href: '/music/discover' },
      { title: 'One-tap favourite everywhere', detail: 'The heart sits on every song row, the player bar and the corner player.', href: '/music' },
      { title: 'One song row everywhere', detail: 'Every song list shows the album art, title, artist and album the same way, with icon actions that name themselves.', href: '/music' },
      { title: 'Search songs by album, with typos', detail: 'Music searches match titles, albums in English or Chinese and artists, in any word order, and forgive a typo.', href: '/music' },
      { title: 'Featured artists, one card each', detail: 'Shared credits are split into artists, with their song counts, sorted by the most songs.', href: '/music/discover' },
      { title: 'Portraits for every character', detail: 'Browse by character shows story characters like Doctor, Theresa and Rat King with their own art.', href: '/music/discover' },
    ],
    fixed: [
      { title: 'Music on iPhones', detail: 'A tap starts the song at once, and a song that cannot start says so instead of showing Pause over silence.', href: '/music' },
      { title: 'Music on networks the CDN misses', detail: 'Where Monster Siren\'s nearest server does not deliver, songs come through Arkpedia\'s own relay instead.', href: '/music' },
      { title: 'Queued songs after a reload', detail: 'Songs you queued stay under Next in queue when the page reloads.', href: '/music' },
      { title: 'Links right after a search', detail: 'Following a link just after typing in a search no longer brings you back to the search.', href: '/music/discover' },
    ],
  },
  {
    at: '2026-10-14T05:00:00Z',
    title: 'Gacha pools that follow Kernel Headhunting',
    changed: [
      { title: 'Gacha pools follow Kernel Headhunting moves', detail: 'When Global moves operators from Standard to Kernel Headhunting, the simulator follows by the next day.', href: '/gacha' },
    ],
    fixed: [
      { title: 'The October 9 Kernel Headhunting batch', detail: 'Goldenglow, Dorothy, Quercus and the rest of that batch leave Standard and limited pools from Standard Pool #177 on.', href: '/gacha' },
      { title: 'Kernel banners running during a move', detail: 'Kernel #63 now includes the operators who joined Kernel Headhunting while it ran.', href: '/gacha' },
      { title: 'Corner music player volume', detail: 'On a desktop its volume slider ran out of the card; it now takes a row of its own when there is no room.' },
      { title: 'Importing a Google or Apple account', detail: 'The import explains which Yostar email to use and warns that another email can create a separate, empty account.', href: '/account' },
    ],
  },
  {
    at: '2026-10-13T15:17:12Z',
    title: 'Selector videos and event news',
    added: [
      { title: 'How to Use videos under selector portraits', detail: 'Selector portraits link to Kukkikaze\'s How to Use video, like Surtr, Mudrock and Saileach in the gifted selector.', href: '/selector-tickets' },
      { title: 'News on event pages', detail: 'The rest of an event\'s official announcement, like a Sanity limit increase or a Kernel Locating banner, in a News tab.', href: '/schedule' },
    ],
  },
  {
    at: '2026-10-12T13:17:15Z',
    title: 'Reading progress and free rewards',
    added: [
      { title: 'Reward Tracker with item icons', detail: 'Track stage rewards, Paradox, pinboard, beginner and Global sign-in gifts with item icons and compact claim lists.', href: '/free-op' },
    ],
    changed: [
      { title: 'Continue stories from your reading progress', detail: 'Story lists show unread or percentage progress, and Continue reading opens the first unread part.', href: '/story' },
      { title: 'Choose operators beside their portraits', detail: 'Planner checkboxes sit before each portrait, and excluded operators turn gray while keeping their place.', href: '/planner' },
      { title: 'Cleaner roaming chibis', detail: 'Pause and dismiss controls appear on hover, tap or keyboard focus.', href: '/operators' },
    ],
    fixed: [
      { title: 'Owned outfits leave your wishlist', detail: 'Your imported outfit collection fulfills matching wishes across the gallery and planners.', href: '/skins' },
      { title: 'Aligned skill mastery and priority labels', href: '/operators' },
    ],
  },
  {
    at: '2026-10-12T00:16:21Z',
    title: 'Music favourites and playlist browsing',
    added: [
      { title: 'Song favourites and playlists', detail: 'Browse All songs while a playlist plays; the plus picker defaults to that playlist, and hearts save to Favourites.', href: '/music' },
    ],
    changed: [
      { title: 'Tap songs to play and drag to sort', detail: 'Drag near an edge to scroll quickly; moving back pauses scrolling, and releasing outside the list cancels the move.', href: '/music' },
    ],
  },
  {
    at: '2026-10-11T11:55:00Z',
    title: 'Schedules, event artwork and sources',
    added: [
      { title: 'Story reading progress', detail: 'Track each story part, see completed stories on the map, and transfer your progress with its own JSON file.', href: '/story' },
      { title: 'Browse your own operator and outfit collections', detail: 'Your profile opens the same collection popups as Import a Friend, with your imported operator builds and owned outfits.', href: '/account' },
      { title: 'Explore player medal collections', detail: 'Use the medal display or View medals to browse sets with official art and in-game layouts, or the full medal list.', href: '/account' },
      { title: 'Joint Operation and Orienteering forecasts', detail: 'Estimated banners return to the schedule, with operator lineups hidden until Global confirmation.', href: '/schedule' },
      { title: 'Reclamation Algorithm release dates', detail: 'RA launches, including RA2, appear in the schedule with their regional dates.', href: '/schedule' },
      { title: 'Official furniture shop artwork', detail: 'Event furniture sets show their in-game shop artwork, imported automatically as new sets arrive.', href: '/events' },
      { title: 'Closure Wiki reference source', detail: 'Closure Wiki is listed in Credits and fills missing stage map previews when the client-art mirror has none.', href: '/credits' },
    ],
    changed: [
      { title: 'Three files in Export everything', detail: 'One ZIP now carries separate player data, music playlists and story progress JSON files.', href: '/account' },
      { title: 'Sliding outfit captions', detail: 'Outfit names and prices slide and fade together when switching artwork, with a still transition for reduced motion.', href: '/operators' },
      { title: 'Patreon supporters', detail: 'Updated Patreon acknowledgements in compact tier rows, ordered from highest to lowest.', href: '/support' },
    ],
    fixed: [
      { title: 'Outfit selection dots', detail: 'Inactive outfit dots are gray again, with teal highlighting the selected artwork.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-10T15:35:00Z',
    title: 'Event and banner updates',
    fixed: [
      { title: 'Correct banners for reruns', detail: 'Reruns show only their own confirmed banner, and unrelated historical banners no longer attach to events.', href: '/schedule' },
      { title: 'Community-only selector ratings', detail: 'Operators without a Kukkikaze rating receive twice their community rating points.', href: '/selector-tickets' },
    ],
    changed: [
      { title: 'Official event details update automatically', detail: 'Global notices update rewards, packs and selector pools, while artwork refreshes retry missing images without losing progress.', href: '/events' },
      { title: 'Highest selector scores first', detail: 'Selector ticket pop-ups rank operators by their recommendation score, including imported account bonuses.', href: '/selector-tickets' },
    ],
  },
  {
    at: '2026-10-10T09:09:00Z',
    title: 'Chibi controls',
    added: [
      { title: 'Choose every chibi animation', detail: 'Play complete battle and base animations in the viewer, including walking, sitting and sleeping.', href: '/operators' },
      { title: 'Move the chibi viewer', detail: 'Drag the viewer within the page; roaming chibis have their own movement pause and play button.', href: '/operators' },
      { title: 'Tap roaming chibis', detail: 'The first tap plays the trust reaction, then later taps have equal chances of playing the normal or trust reaction.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-10T08:59:00Z',
    title: 'Upcoming banner forecasts',
    changed: [{ title: 'Joint Operation and Orienteering forecasts', detail: 'See approximate Global dates in Schedule, Gacha and Pull Planner; operator lineups appear after Global confirmation.', href: '/schedule' }],
  },
  {
    at: '2026-10-10T00:44:03Z',
    title: 'Selector recommendations',
    added: [
      { title: 'Selector ticket recommendations', detail: 'Compare gifted and purchasable 6★ tickets with colored scores based on Kukkikaze ratings and your imported roster.', href: '/selector-tickets' },
    ],
  },
  {
    at: '2026-10-09T14:39:11Z',
    title: 'Import a Friend',
    added: [
      { title: 'Import a Friend', detail: 'Export your account as a file and view a friend’s profile, operator builds and skins, saved separately from your own account.', href: '/friends' },
    ],
  },
  {
    at: '2026-10-09T09:56:52Z',
    title: 'Chibi breaks',
    added: [
      { title: 'Roaming chibis take a break', detail: 'Chibis occasionally sit on a chair, sleep in a bed, or play their base idle and special animations.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-09T01:21:49Z',
    title: 'Music playlists',
    added: [
      { title: 'Save and transfer music playlists', detail: 'Save your queue or favorites as a playlist, then export or import Arkpedia playlist files between browsers.', href: '/music' },
    ],
  },
  {
    at: '2026-10-08T23:51:56Z',
    title: 'Web events and campaign art',
    added: [
      { title: 'Artwork for regional web events', detail: 'See official campaign images alongside regional links and closing times in World.', href: '/community' },
    ],
    changed: [
      { title: 'Automatic web-event discovery', detail: 'Daily checks of official announcements add verified campaigns and update their dates and artwork.', href: '/community' },
    ],
  },
  {
    at: '2026-10-08T22:50:18Z',
    title: 'Smoother animated artwork',
    changed: [
      { title: 'Fewer pauses in animated art', detail: 'Particle effects use less processing and prepare animation restarts ahead of time to reduce stutters.', href: '/skins' },
    ],
  },
  {
    at: '2026-10-08T17:29:37Z',
    title: 'Skin planning, animated art and operator updates',
    added: [
      { title: 'Particles in animated outfit art', detail: 'Sparks, fire, petals and lightning now play in the animated art, as in the game; trails and a few effects come later.', href: '/skins' },
      { title: 'Fullscreen art in the Skin Planner', detail: 'Press an outfit to inspect its artwork and animations, with a separate button to add it to your plan.', href: '/skin-planner' },
      { title: 'Fashion Review', detail: 'A dedicated button groups Fashion Review outfits in the skin database and planner.', href: '/skins' },
      { title: 'Alternate animated illustrations', detail: 'Choose Version 2 where the outfit includes another illustration, including Exusiai’s The Legend Seeker.', href: '/skins' },
      { title: 'Operator previews on the home page', detail: 'Click a featured or returning operator to preview their stats, skills and talents, as in the Gacha Simulator.', href: '/' },
    ],
    changed: [
      { title: 'Home page stage and countdown colors', detail: 'Open stages and Starts in are green, closed stages are red, and Ends in is yellow.', href: '/' },
    ],
    fixed: [
      { title: 'Upcoming skins and returning shops', detail: 'Upcoming outfits follow their acquisition dates, and partial shop announcements keep other returning batches.', href: '/skins' },
      { title: 'Shared effects in animated art', detail: 'Kal’tsit - Esperanta’s warning screens and other effects now play with their animations.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-07T23:26:00Z',
    title: 'Animated outfit art, credits and fixes',
    added: [
      { title: 'Animated outfit art', detail: 'Outfits that move in the game play full screen, entrance and music included: press Animated.', href: '/skins' },
      { title: 'Effects in animated outfit art', detail: 'Flowing skies, water, flames and dissolving smoke now play in the animated art, as in the game.', href: '/skins' },
      { title: 'Animated art for CN outfits', detail: 'Outfits CN already has, like One More Story, play their animated art before Global releases them.', href: '/skins' },
      { title: 'Outfit voice lines', detail: 'Outfits with a voice of their own, like Red Countess, have their lines in the voice language menu on the operator page.', href: '/operators' },
      { title: 'Credits page', detail: 'The community projects and sites Arkpedia gets its data and art from, linked in the Community menu.', href: '/credits' },
      { title: 'Angled and turning pieces in animated art', detail: 'Pieces set at an angle or tumbling in depth now show, like the cassette Thorns sits on in Boundless Sail.', href: '/skins' },
    ],
    changed: [
      { title: 'One menu section at a time', detail: 'In the phone menu, opening a section folds the one that was open.' },
    ],
    fixed: [
      { title: 'Operator search on iPhone', detail: 'Tapping an operator in the search list on an operator page opens it, instead of closing the list.', href: '/operators' },
      { title: 'Assistant profile picture', detail: 'An imported account whose avatar is its assistant shows the assistant in their outfit, no re-import needed.', href: '/account' },
      { title: 'Story map arrows', detail: 'The lines between stories end in arrowheads, as on the original map, and reach the cover they point to.', href: '/story' },
      { title: 'Fades, dissolves and slides in animated art', detail: 'Effects that fade, dissolve or slide over time now move as in the game instead of standing still.', href: '/skins' },
      { title: 'Music keeps playing after updates', detail: 'After a site update or a reload the song carries on where it was, or waits there for one tap where the browser asks for one.', href: '/music' },
      { title: 'Operator material costs', detail: 'Promotion, skill, mastery and module costs now come from the game itself; 118 were wrong or missing, like Closure\'s S3M3.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-06T14:40:00Z',
    title: 'Event pages and Pull History',
    added: [
      { title: 'Pull History', detail: 'Your pulls by banner and in order, from the 90 days Yostar keeps, growing past that with each import.', href: '/account' },
      { title: 'Expanded the shown rewards', detail: 'Logins, gifts, missions, first clears, milestones, packs and furniture sets; selector tickets and mail rewards are not shown yet.', href: '/schedule' },
      { title: 'All tab on event rewards', detail: 'Every free reward on one card, to copy as a link or save as an image.', href: '/schedule' },
      { title: 'Art for newly announced CN events', detail: 'Events and banners announced on CN show their key art from the official post, before the wiki has it.', href: '/schedule' },
      { title: 'Story chapters', detail: 'Click a story on the map to pick a stage, Before or After, then read it in Timo\'s reader.', href: '/story' },
      { title: 'Export simulated pulls', detail: 'The Gacha Simulator saves its pull history as a CSV, for your own charts.', href: '/gacha' },
      { title: 'Japan and Korea accounts', detail: 'Import from the Japanese and Korean servers too, and switch between your accounts on each.', href: '/account' },
      { title: 'Export your Pull History', detail: 'Save your imported pulls as a CSV, one row per pull with its banner and pity.', href: '/account' },
      { title: 'Remember your sign-in', detail: 'Optionally keep your Yostar sign-in in this browser, so the next import is one button.', href: '/account' },
      { title: 'Back button on event pages', detail: 'Returns to where you came from, or to the Schedule.' },
    ],
    changed: [
      { title: 'Event page layout', detail: 'Event art across the top, full-width sections, and a compact rewards summary.', href: '/schedule' },
      { title: 'Joint Operation and Orienteering', detail: 'Shown only once Global announces them, with Global\'s operators: CN picks different ones.', href: '/gacha' },
      { title: 'Locks on imported numbers', detail: 'Your Pull Planner resources and Operator Planner starting levels stay put until you unlock them.', href: '/pulls' },
      { title: 'Operator data from the game itself', detail: 'Skills, talents, traits and modules are rebuilt every night; CN modules show until Global has them.', href: '/operators' },
      { title: 'Operator search keeps your place', detail: 'Jumping to another operator stays on the section you were reading, such as Base skills.', href: '/operators' },
      { title: 'Techniques', detail: 'Modules that reveal invisible enemies are listed, traits count, and Hunters are no longer ammo-based.', href: '/techniques' },
      { title: 'Music song list', detail: 'Opens without moving the player, and shows where a song you drag will land.', href: '/music' },
      { title: 'Cleaner phone bar', detail: 'The menu and theme buttons sit in the bar without boxes.' },
      { title: 'Story chapter covers centred', detail: 'The chapter pop-up shows its cover whole, centred above the stages.', href: '/story' },
      { title: 'Resources lock at the end of the row', detail: 'The Pull Planner lock sits after Yellow certs instead of under Orundum.', href: '/pulls' },
    ],
    fixed: [
      { title: 'Traits that change at Elite 2', detail: 'Both versions show, like Pudding\'s, instead of "varies by promotion".', href: '/operators' },
      { title: 'Reward art', detail: 'Profile icons, furniture and items like Expedited Plan show their pictures.', href: '/schedule' },
      { title: 'Skill tabs in the operator preview', detail: 'Switching to a shorter skill no longer moves the tabs under your pointer.', href: '/gacha' },
    ],
  },
  {
    at: '2026-10-03T12:10:00Z',
    title: 'Your account, the planners, and the story',
    added: [
      { title: 'Import your Global account', detail: 'Sign in with your Yostar email code; operators, outfits, materials, stages and profile stay in your browser.', href: '/account' },
      { title: 'Your profile card', detail: 'Drawn like the game\'s: support units, hiring progress and card theme.', href: '/account' },
      { title: 'Owned / Not owned filters', detail: 'On Operators, Skins and the Skin Planner, with counts from your import.', href: '/operators' },
      { title: 'Skin Planner', detail: 'Plan outfits by shop and price, with one wishlist shared with Skins and the Pull Planner.', href: '/skin-planner' },
      { title: 'OP Tracker', detail: 'The Originite Prime and Orundum that first clears still owe you, ticked off from your import.', href: '/free-op' },
      { title: 'Story page', detail: 'Timo\'s story reader and the Arknights Story Map, with full screen and a list for phones.', href: '/story' },
      { title: 'Manga page', detail: 'Every official comic from the Global site, with links to read each one.', href: '/manga' },
      { title: 'One Import / export', detail: 'On the Import Account page, with a backup of all your planner data.', href: '/account' },
      { title: 'This What\'s new page' },
    ],
    changed: [
      { title: 'Pull Planner fills itself in', detail: 'An import fills Orundum, OP, permits and yellow certs; Income, Past events and the wishlist open as popups.', href: '/pulls' },
      { title: 'Pull Planner budgeting', detail: 'Budgets through your last banner, and you choose whether the skin wishlist holds OP back.', href: '/pulls' },
      { title: 'Operator Planner views', detail: 'Missing and All, crafting ingredients on the list, and holdings you can edit in the recipe.', href: '/planner' },
      { title: 'Planner menu', detail: 'Import Account, OP Tracker, Operator Planner, Skin Planner and Pull Planner in one place.' },
      { title: 'Base uses your operators', detail: 'The room picker offers the operators you own, at your elite.', href: '/base' },
      { title: 'Events by release date', detail: 'And the permanent Annihilations are listed with their certificates.' },
      { title: 'Phone menu', detail: 'The menu button is on the left, and the menu folds into sections.' },
    ],
    fixed: [
      { title: 'Pull Planner crash', detail: 'It no longer crashes when some of its data is missing.', href: '/pulls' },
      { title: 'Skin Planner art', detail: 'Every outfit shows its art again.', href: '/skin-planner' },
      { title: 'Popups scroll once', detail: 'The header stays put, with one scroll bar instead of two.' },
      { title: 'Link colour', detail: 'Links in page text stay teal after you have opened them.' },
      { title: 'Music player on desktop', detail: 'It is no longer cut off.', href: '/music' },
    ],
  },
];

/** The newest entry's moment: what "seen" is measured against (lib/changelog/seen.ts). ISO UTC
 *  instants compare as strings in time order. */
export const LATEST_CHANGE = CHANGELOG[0]?.at ?? '';
