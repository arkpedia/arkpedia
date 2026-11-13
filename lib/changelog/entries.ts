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
    at: '2026-11-13T12:30:00Z',
    fixed: [{ title: 'Clearer supporter sync status', detail: 'An initial sync failure shows a retryable error instead of remaining in preparation.', href: '/support' }],
  },
  {
    at: '2026-11-13T11:45:00Z',
    added: [{ title: 'Collaborations in other games', detail: 'Find Arcaea, Cytus II, Muse Dash and Delta Force collaborations in the calendar and its synced feed.', href: '/schedule' }],
  },
  {
    at: '2026-11-13T11:30:00Z',
    added: [{ title: 'Official artwork for event packs', detail: 'View pack promotions at full size alongside their contents, with artwork refreshed from official announcements.', href: '/events' }],
  },
  {
    at: '2026-11-13T09:35:00Z',
    changed: [
      { title: 'Wider reward images for busy events', detail: 'Large reward lists use more columns, keeping featured rewards together and reducing vertical scrolling.', href: '/events' },
      { title: 'Daily Patreon acknowledgements', detail: 'Public supporter names and tiers refresh automatically, with the last update time shown.', href: '/support' },
      { title: 'Clearer contact details', detail: 'Contact Kukkikaze for sponsorships and other inquiries, or JungerMin for website support and privacy.', href: '/about' },
    ],
  },
  {
    at: '2026-11-13T08:25:00Z',
    changed: [{ title: 'Preview and share event reward images', detail: 'Open the fullscreen reward image, save it, or copy a link that opens the same view.', href: '/events' }],
  },
  {
    at: '2026-11-12T23:43:24Z',
    changed: [{ title: 'Featured free rewards in saved images', detail: 'Welfare operators and free skins get full art in compact cards, with total EXP and pulls on the material cards.', href: '/events' }],
    fixed: [{ title: 'Clearer event exchange listings', detail: 'Shop cards show stock limits, with alchemy rewards identified as exchanges.', href: '/events' }, { title: 'Event rewards keep their CN fallback', detail: 'Missing shops and exchanges use CN sources until Global details become available.', href: '/events' }],
  },
  {
    at: '2026-11-12T17:59:21Z',
    fixed: [{ title: 'Aligned pull counts on phones', detail: 'The clickable Available count lines up with the Pulls input and the other banner values.', href: '/pull-planner' }],
  },
  {
    at: '2026-11-12T17:34:22Z',
    added: [
      { title: 'Subscribe to the event calendar', detail: 'Sync automatic schedule updates to your calendar app, with optional predicted dates and operator birthdays.', href: '/schedule' },
      { title: 'See where available pulls come from', detail: 'Tap a banner’s Available count for resources, income, stage-clear OP, reservations and banner-only pulls.', href: '/pull-planner' },
      { title: 'Save shareable event reward images', detail: 'Download a readable reward list with game icons, full item names and muted event artwork in your current theme.', href: '/events' },
    ],
    changed: [
      { title: 'Consistent planner forecasts', detail: 'Banner plans, Income and pull calculations use the same rewards, deadlines and OP settings.', href: '/pull-planner' },
      { title: 'Matching event panels and Global artwork', detail: 'Operators, rewards, skins, news and videos share a card layout, with Global art used when available.', href: '/events' },
      { title: 'Clearer confirmed and predicted dates', detail: 'Official Global dates are distinguished from CN estimates across the schedule and planner.', href: '/schedule' },
    ],
    fixed: [
      { title: 'Reward tracking follows imported progress', detail: 'Owned operators, E2 requirements and completed rewards are tracked separately when importing your save.', href: '/reward-tracker' },
      { title: 'Readable base-skill descriptions', detail: 'Official English skill descriptions retain their spacing and punctuation.', href: '/operators' },
      { title: 'Native music visualization', detail: 'Compatible iPhone app builds use the native analyzer for spectrum and waveform views.', href: '/music' },
    ],
  },
  {
    at: '2026-11-10T08:03:35Z',
    changed: [
      { title: 'Clearer story reading progress', detail: 'Read, Unread and percentage labels use green, red and amber while story cards keep their quiet borders.', href: '/story' },
      { title: 'Pinch to zoom the story map', detail: 'Two-finger gestures zoom the map, with normal page zoom available outside it.', href: '/story' },
    ],
    fixed: [{ title: 'Story map rendering on phones', detail: 'The map scales its text and artwork together without a full-size transformed board.', href: '/story' }],
  },
  {
    at: '2026-11-09T16:36:19Z',
    fixed: [
      { title: 'Enemy tabs keep their place', detail: 'Switching between Resistances and Stages preserves the detail panel’s scroll position.', href: '/enemies' },
      { title: 'Albums open reliably from Discover', detail: 'Opening an album no longer races a pending Show all or search update.', href: '/music/discover' },
      { title: 'Instrumental lyrics and matching timing', detail: 'Recognizes alternate instrumental names and corrects measured recording and video-intro offsets.', href: '/music' },
      { title: 'Twitch streams appear without a refresh', detail: 'Opening the Twitch tab from the homepage now checks the live feed immediately.', href: '/world' },
      { title: 'Steady volume when switching song versions', detail: 'Switching between vocals and instrumentals keeps the same playback volume on iPhone.', href: '/music' },
      { title: 'Outfit and music videos reach their categories', detail: 'Video grouping recognizes plural outfits, BGM compilations and voice lines instead of leaving them in Other.', href: '/world' },
    ],
    changed: [
      { title: 'Expand mobile lyrics with one tap', detail: 'The lyrics button opens a taller scrolling view with the visualizer and playback controls still visible.', href: '/music' },
      { title: 'Matching autoplay block icons', detail: 'The player and song rows use the same icon to keep a song out of automatic library playback.', href: '/music' },
      { title: 'One player across the site', detail: 'Use the same controls in every music view and on other pages, with a minimize button and raised volume percentages.', href: '/music' },
      { title: 'Clearer volume and player controls', detail: 'Favourite, Block and Stream-safe sit beside volume, and the speaker toggles mute while remembering the previous level.', href: '/music' },
      { title: 'Consistent music layouts and menus', detail: 'Now Playing stays in place between tracks, while More keeps extra actions and shows help without expanding.', href: '/music' },
      { title: 'Queue always opens as a popup', detail: 'Open your queue from any player or Music menu without leaving the current page.', href: '/music' },
    ],
  },
  {
    at: '2026-11-08T08:09:00Z',
    added: [
      { title: 'Most liked on Arkpedia', detail: 'Discover ranks songs daily using favourites from accounts that contribute to community statistics.', href: '/music/discover' },
      { title: 'Banner-specific headhunting guarantees', detail: 'See how Standard and Kernel Selection work after 150 and 300 pulls, alongside guides for Crossover and The Front That Was.', href: '/gacha-simulator' },
    ],
    changed: [
      { title: 'A queue that follows what you play', detail: 'See upcoming tracks from your album, playlist or search, and open the queue while reading lyrics.', href: '/music' },
      { title: 'Switch between vocals and instrumentals', detail: 'Switch at the matching passage on compatible recordings and choose a spectrum or waveform below the lyrics.', href: '/music' },
    ],
  },
  {
    at: '2026-11-06T23:00:00Z',
    changed: [{ title: 'Community statistics load from daily totals', detail: 'Shared daily updates keep rankings quick to open, with the last update time shown on the page.', href: '/community/statistics' }],
  },
  {
    at: '2026-11-06T20:00:00Z',
    fixed: [{ title: 'Completed Paradox Simulations import correctly', detail: 'Successful handbook clears now count even when the game retains an unlocked stage state.', href: '/reward-tracker' }],
    changed: [{ title: 'New Doctor mail is easier to identify', detail: 'Imports check the retained 3,800 Orundum supply mail; unavailable claim history stays manual and excluded from totals.', href: '/reward-tracker' }],
  },
  {
    at: '2026-11-06T16:40:00Z',
    title: 'Videos for what is happening now',
    added: [
      { title: 'Browse videos by category', detail: 'Find guides, operator analyses, outfit showcases and more, including CN videos.', href: '/world/videos' },
      { title: 'Older guides return when relevant', detail: 'Current Global events, obtainable operators and available outfits bring useful older videos to the front.', href: '/world/videos' },
    ],
    changed: [
      { title: 'One homepage video, different creators', detail: 'The Community carousel keeps one video slot and features a different creator each round.', href: '/' },
      { title: 'Farming materials have their own card', detail: 'Currently farmable materials stay separate from upcoming events, with larger gacha banner previews nearby.', href: '/' },
    ],
    fixed: [{ title: 'Videos survive temporary feed failures', detail: 'The last successful uploads remain available when YouTube feeds cannot be reached.', href: '/world/videos' }],
  },
  {
    at: '2026-11-06T10:54:00Z',
    fixed: [{ title: 'Reruns use imported stage progress first', detail: 'Available stage records take priority over medals when detecting whether you already cleared a rerun.', href: '/pull-planner' }],
  },
  {
    at: '2026-11-05T21:53:00Z',
    title: 'Clearer browsing across Arkpedia',
    added: [
      { title: 'Enemy names in the picker', detail: 'Enemy tiles show names alongside handbook codes, including on phones.', href: '/enemies' },
      { title: 'Search examples to get started', detail: 'Try an operator, stage, event or music search directly from the empty search page.', href: '/search' },
      { title: 'More community streams and videos', detail: 'Homepage community cards now include links to the matching World section.', href: '/' },
    ],
    changed: [
      { title: 'Better framing on the homepage', detail: 'Event and banner art fit their slots more closely, with aligned panels on desktop.', href: '/' },
      { title: 'More compact operator filters', detail: 'Search, rarity and class filters share a row on wide screens.', href: '/operators' },
      { title: 'Clearer account and information pages', detail: 'An empty profile offers an import action; information-page navigation aligns consistently on phones.', href: '/account' },
      { title: 'A shared card entrance', detail: 'Operator, outfit and stage catalogues use the same short rise, respecting reduced motion.' },
    ],
    fixed: [
      { title: 'Enemy pages open at the top', detail: 'Opening the handbook on a phone keeps the heading and picker in view.', href: '/enemies' },
      { title: 'More readable stage labels', detail: 'Stage names and years get more room, and desktop Terminal sections span the bar.', href: '/stages' },
      { title: 'Wishlist totals and farming rows align', detail: 'Wishlist totals wrap on phones, while farming stage codes line up beneath material names.', href: '/pull-planner' },
    ],
  },
  {
    at: '2026-11-05T20:00:00Z',
    fixed: [{title: 'Skin dates follow live schedule corrections', detail: 'The gallery and homepage use the published shop windows together, including corrected opening and closing times.', href: '/skins'}],
  },
  {
    at: '2026-11-05T19:50:00Z',
    fixed: [{title: 'Rerun outfits appear when their shop opens', detail: 'Outfit shops, banners and rewards now share official notice dates, including notices that omit the year.', href: '/skins'}],
  },
  {
    at: '2026-11-05T17:40:35Z',
    added: [{title:'Full-screen artwork from live poll results',detail:'Open full-size art and animations from the podium, tier list or ranking tables, then return to the same results.',href:'/polls/favourite-skins'}],
    fixed: [{title:'More reliable cold statistics loads',detail:'New regions retry brief database overloads once, while cached totals still respect current sharing consent.',href:'/community/statistics'}],
  },
  {
    at: '2026-11-05T15:13:28Z',
    added: [{title:'Full-screen art while rating skins',detail:'Open an outfit’s artwork and animations, then return to the same rating.',href:'/polls/favourite-skins'}],
    changed: [
      {title:'Poll previews show the actual leaders',detail:'Both poll cards place first in the middle, with second on the left and third on the right.',href:'/polls'},
      {title:'Clearer ways back from community results',detail:'Back buttons return from artwork, rating dialogs, detailed results and poll pages.',href:'/polls'},
    ],
  },
  {
    at: '2026-11-05T12:30:00Z',
    added: [
      { title: 'Explore community rankings', detail: 'Compare operator upgrades and uploaded auto-deploy usage, with filters and absolute or relative rankings.', href: '/community/statistics' },
      { title: 'Arkpedia Drip Awards', detail: 'Rate outfits from 1–10, return to your saved ratings, and explore public rankings, tier lists and detailed results.', href: '/polls' },
    ],
    changed: [
      { title: 'Community and Extras menus', detail: 'Find polls, statistics and supports together; Music and Games now live in Extras.' },
      { title: 'Friends have their own profile tab', detail: 'Import manually shared friend files from the Friends tab.', href: '/account' },
    ],
  },
  {
    at: '2026-11-04T14:10:00Z',
    fixed: [{ title: 'Talulah’s pull chances', detail: 'Plan Talulah goals with confirmed CN rates, exchange costs, and her 300-pull gift.', href: '/pull-planner' }],
  },
  {
    at: '2026-11-04T08:07:00Z',
    fixed: [{ title: 'New banners reach the Pull Planner', detail: 'CN banners such as Talulah’s now use the same estimated Global dates as the gacha simulator.', href: '/pull-planner' }],
  },
  {at:'2026-11-03T19:05:00Z',changed:[{title:'One search for operators and friend tags',detail:'Choose an operator or search a shared in-game tag from the same field.',href:'/community/support-units'}],fixed:[{title:'Support cards stay compact after filtering',detail:'Small result lists keep the same card size as the full list.',href:'/community/support-units'}]},
  {at: '2026-11-03T19:00:00Z', fixed: [{title: 'Community stats match available promotions', detail: 'Lower-rarity operators show their highest available promotion and hide unavailable masteries.', href: '/operators'}]},
  {
    at: '2026-11-03T17:15:00Z',
    added: [{ title: 'Find supports by in-game tag', detail: 'Search shared friend tags alongside operator and build filters.', href: '/community/support-units' }],
    changed: [
      { title: 'Saving and sharing in one place', detail: 'Manage private saves and community choices in one tab, with explanations beside each option.', href: '/account' },
      { title: 'Clearer community build statistics', detail: 'Headlines show M3 and level 3 modules; legends now include no masteries and no module.', href: '/operators' },
    ],
  },
  {
    at: '2026-11-03T15:10:00Z',
    added: [{ title: 'Community stats across regions', detail: 'Choose All to combine Global, JP and KR statistics, or select a region for its own results.', href: '/operators' }],
  },
  {
    at: '2026-11-03T14:00:00Z',
    fixed: [{ title: 'Tab underlines at every zoom', detail: 'Skill and other tab underlines stay aligned when you change your browser zoom.' }, { title: 'Animated outfits from every entry point', detail: 'Animated artwork is available from homepage, event and calendar outfit popups, just like the skin gallery.', href: '/skins' }],
  },
  {
    at: '2026-11-03T12:53:00Z',
    changed: [{ title: 'Clearer mastery and promotion stats', detail: 'Skill bars show M1–M3 among E2 owners, and the promotion headline shows the E2 percentage.', href: '/operators' }],
    fixed: [{ title: 'Statistics popups stay out of the way', detail: 'Mouse details close as soon as you leave the bar, keeping lower modules accessible; touch and keyboard still work.', href: '/operators' }],
  },
  {
    at: '2026-11-03T10:15:00Z',
    changed: [
      { title: 'Community stats at a glance', detail: 'Compact bars show promotion, skill ranks and exact module levels, with percentages on hover or tap.', href: '/operators' },
      { title: 'Refreshed outfit details', detail: 'Larger uncropped artwork, compact details and easier controls on phones.', href: '/skins' },
      { title: 'Streamer Mode music filters', detail: 'More known claim-risk artists and duplicate recordings are excluded when Streamer Mode is on.', href: '/music' },
    ],
    fixed: [
      { title: 'Import and keep downloading', detail: 'Opted-in auto-deploy downloads start after importing and continue while you browse in the same tab.', href: '/account' },
      { title: 'Your profile picture follows your account', detail: 'Profile pictures save separately from replaceable cloud saves, with clearer profile settings.', href: '/account' },
      { title: 'The same artwork viewer everywhere', detail: 'Account and friend skins use the full artwork viewer, with centred controls on phones.', href: '/account' },
      { title: 'Support filters survive reload', detail: 'Reloading a filtered support search no longer briefly offers unfiltered builds.', href: '/community/support-units' },
      { title: 'Planner rewards switch off completely', detail: 'Off excludes expected rewards, including unclaimed permanent-content rewards.', href: '/planner' },
    ],
  },
  {
    at: '2026-11-02T22:45:00Z',
    fixed: [{ title: 'Annihilation auto-deploy downloads', detail: 'Sync all uses the correct replay address for Annihilation stages, and failed requests now name the stage.', href: '/account' }],
  },
  {
    at: '2026-11-02T21:15:00Z',
    changed: [{ title: 'Community stats for smaller groups', detail: 'Once a server has 10 contributors, all known upgrade and outfit percentages appear, including zeroes.', href: '/operators' }],
  },
  {
    at: '2026-11-02T20:20:00Z',
    fixed: [{ title: 'Auto-deploy download banner', detail: 'Download progress now stays centred within the page width on phones and desktops.', href: '/account' }],
  },
  {
    at: '2026-11-02T15:20:00Z',
    added: [
      { title: 'Arkpedia accounts enter Beta', detail: 'Sign in with Google or Discord and choose which settings, plans and imported game data to save across devices.', href: '/account' },
      { title: 'Find community support units', detail: 'Opt in to share your equipped supports and friend tag, or search by operator, level and mastery.', href: '/community/support-units' },
      { title: 'Community operator and skin statistics', detail: 'Contribute optionally to ownership, upgrades, masteries and outfit statistics.', href: '/operators' },
      { title: 'Background and event music', detail: 'Enable either separately and choose a background song, including your imported menu theme or Endfield music.', href: '/music' },
      { title: 'Save your auto-deploys', detail: 'Download and optionally save replays to your account while browsing, with pause and resume controls.', href: '/account' },
    ],
  },
  {
    at: '2026-11-02T12:00:00Z',
    fixed: [{ title: 'Walking chibis keep their size', detail: 'Detached skin decorations no longer make roaming characters unusually small.', href: '/operators' }],
  },
  {
    at: '2026-11-02T00:58:00Z',
    fixed: [{ title: 'Headhunting filters include every rarity', detail: 'Standard and Kernel headhunting now work with lower-rarity operator filters.', href: '/operators' }],
  },
  {
    at: '2026-11-01T23:35:00Z',
    fixed: [{ title: 'Calendar years stay visible', detail: 'Browsing beyond the scheduled years keeps the selected year visible and the calendar controls in place.', href: '/schedule' }],
  },
  {
    at: '2026-10-31T19:00:00Z',
    fixed: [{ title: 'Recover interrupted page loads', detail: 'Retry missing styles and recover failed startup files instead of leaving an unstyled page.' }],
  },
  {
    at: '2026-10-30T20:35:00Z',
    changed: [{ title: 'Combine operator filters', detail: 'Select several rarities, classes, subclasses and dropdown options without clearing your other choices.', href: '/operators' }],
    fixed: [
      { title: 'One total for shared Chip Catalysts', detail: 'Crafting several Dualchip types updates the same ingredient row.', href: '/operator-planner' },
      { title: 'Operator dates follow the calendar', detail: 'Upcoming operators use the event forecast, with estimates kept separate from confirmed availability.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-30T08:00:00Z',
    fixed: [
      { title: 'Base skills read properly again', detail: 'Twelve base skills ran their words together, as in "grantsWorldly Plight+1"; the missing spaces are back.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-29T18:00:00Z',
    changed: [
      { title: 'Schedule is a menu', detail: 'The Schedule button in the header opens Events and Calendar, in place of the two tabs on the page.', href: '/schedule' },
    ],
  },
  {
    at: '2026-10-29T13:00:00Z',
    added: [
      { title: 'Operator previews from the planner and pulls', detail: 'The Operator Planner\'s artwork and every operator in Pull History open the operator\'s quick preview.', href: '/operator-planner' },
      { title: 'Event pages list every operator', detail: 'An Operators tab shows the banner\'s rate-up and returning operators, the welfare operator and any reward operator.', href: '/schedule' },
    ],
    changed: [
      { title: 'One flat look for cards', detail: 'Profile operator cards, credit portraits and the planner\'s operator card now match the roster\'s flat cards.', href: '/voice-actors' },
      { title: 'One panel style across the site', detail: 'Panels and static cards now share one background and one border, from the home page to event rewards.', href: '/' },
      { title: 'Operator previews show full stats', detail: 'The operator preview shows stats like the operator page: base, trust and the attack and deployment values.', href: '/gacha-simulator' },
    ],
    fixed: [
      { title: 'Planner tab underline stays under its tab', detail: 'The current operator tab\'s underline now ends at its × instead of running on towards the next tab.', href: '/operator-planner' },
    ],
  },
  {
    at: '2026-10-29T09:00:00Z',
    added: [
      { title: 'Use OP for pulls', detail: 'The Pull Planner can leave Originite Prime out of every pull total, for OP you keep for outfits or sanity.', href: '/pulls' },
    ],
    changed: [
      { title: 'Skin Planner opens on outfits you do not own', detail: 'With an imported account it starts on Not owned; the Pull calculation always shows its Skin planner term.', href: '/skin-planner' },
      { title: 'Event rewards line up', detail: 'The Income pop-up lists each event\'s OP and permits in two aligned columns.', href: '/pulls' },
    ],
  },
  {
    at: '2026-10-28T21:30:00Z',
    changed: [
      { title: 'Summon stats read like the operator\'s', detail: 'An operator page folds its summons under Stats, in the same stat block with the same icons and controls.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-28T19:28:00Z',
    added: [
      { title: 'Exclude Paradox Simulations', detail: 'The Reward Tracker can leave out every Paradox Simulation, those of operators you do not own, or those of operators below Elite 2.', href: '/free-op' },
    ],
    fixed: [
      { title: 'Newer Record Restoration operators listed', detail: 'Catherine, Papyrus, Crownslayer, Rose Salt, Xingzhu and Brigid now show as obtainable from Record Restoration.', href: '/free-op' },
      { title: 'Cleared events count by their medals too', detail: 'The game forgets a closed event\'s clears; the event\'s all-stages medal in your import now ticks its rerun.', href: '/pulls' },
      { title: 'A Flurry to the Flame Rerun ticks for Rathalos', detail: 'The event has no all-stages medal, so owning Rathalos S Noir Corne now marks it cleared in the Pull Planner.', href: '/pulls' },
    ],
  },
  {
    at: '2026-10-28T12:30:00Z',
    fixed: [
      { title: 'Reruns of cleared events no longer count twice', detail: 'The Pull Planner ticks a rerun as already cleared when your import or your Reward Tracker ticks say so.', href: '/pulls' },
    ],
    changed: [
      { title: 'Pull Planner: Add banner opens a pop-up', detail: 'The Pull calculation now shows the Skin wishlist\'s reserved OP as its own Skin planner term.', href: '/pulls' },
      { title: 'The Pull Planner loads lighter', detail: 'It now sends only the banners and outfit shops still ahead on some server, half the data it did.', href: '/pulls' },
    ],
  },
  {
    at: '2026-10-27T21:30:00Z',
    changed: [
      { title: 'Pull history kept once', detail: 'Each import adds to one archive per game account; the account record and backups no longer carry a second copy of the rows.', href: '/account' },
    ],
  },
  {
    at: '2026-10-27T20:35:00Z',
    fixed: [
      { title: 'Base skills read the same everywhere', detail: 'Operator previews opened from pulls and the home page now show base skill keywords and numbers with their formatting.', href: '/gacha-simulator' },
    ],
  },
  {
    at: '2026-10-27T19:59:00Z',
    changed: [
      { title: 'Pages load lighter and hold still', detail: 'The home page sends a tenth of the data it did, and the menu, filter chips and dialogs no longer shift as a page loads.', href: '/' },
      { title: 'Filters respond at once', detail: 'Operator, recruitment and results filters show the press before the list follows.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-27T19:25:00Z',
    fixed: [
      { title: 'Your pull plan loads again after a reload', detail: 'A plan saved after an account import with many claimed rewards no longer refuses to load on the next visit.', href: '/pulls' },
    ],
  },
  {
    at: '2026-10-27T16:00:00Z',
    title: 'Site and music UI update',
    changed: [
      { title: 'UI update for the site', detail: 'Clearer navigation, compact page controls, local profile settings and updated page addresses are now available.', href: '/' },
      { title: 'Music player UI update', detail: 'Refined player controls, lyrics and queue navigation keep your listening tools together.', href: '/music' },
      { title: 'Reward Tracker UI update', detail: 'Reward icons, clearer totals and stage exclusions make unclaimed rewards easier to track.', href: '/reward-tracker' },
    ],
    added: [
      { title: 'Import without leaving the page', detail: 'Open Import / export in place and return to your filters, completion marks and scroll position.', href: '/reward-tracker' },
      { title: 'More community projects', detail: 'Find fan-made tools, wikis, games and story readers, with official project artwork and direct links.', href: '/community/projects' },
    ],
  },
  {
    at: '2026-10-27T15:24:17Z',
    fixed: [
      { title: 'Collab free pulls count in your plan', detail: 'Banner-specific login and mailed tickets now count when they unlock, without carrying over to other banners.', href: '/pulls' },
    ],
  },
  {
    at: '2026-10-27T14:19:00Z',
    changed: [
      { title: 'Better staffing for smaller rosters', detail: 'The base optimizer considers ordinary workers, keeps a return crew and checks empty factories separately.', href: '/base' },
    ],
  },
  {
    at: '2026-10-27T13:57:00Z',
    changed: [
      { title: 'Base teams at a glance', detail: 'See operator portraits, colour-coded buildings and daily yields in a compact optimizer.', href: '/base' },
    ],
  },
  {
    at: '2026-10-27T13:15:00Z',
    changed: [
      { title: 'Clearer farming countdowns', detail: 'Only current/next event timers appear: green before opening, yellow while running; chapter shops are included.', href: '/farming' },
    ],
    added: [
      { title: 'Farming source previews', detail: 'Click a stage or Event Store tag to see its event or chapter name and artwork without leaving the guide.', href: '/farming' },
    ],
  },
  {
    at: '2026-10-26T21:37:03Z',
    changed: [
      { title: 'Profile settings in separate tabs', detail: 'Your username and friend tag now have their own tab, separate from the profile picture picker.', href: '/account' },
      { title: 'More useful profile icon categories', detail: 'Base Skill and Items have their own categories, with base skills grouped by facility and remaining icons under Others.', href: '/account' },
      { title: 'A clearer What’s new', detail: 'Updates now follow one reading column, with clearer dates, larger descriptions and more space between entries.', href: '/whats-new' },
    ],
    fixed: [
      { title: 'Twitch live status refreshes sooner', detail: 'Home and the live directory refresh every 30 seconds and on tab return, removing streams that go offline or switch games.', href: '/world/twitch' },
      { title: 'Consistent operator preview artwork', detail: 'Operator previews fit the visible artwork instead of its transparent padding, and mastered skills show mastery icons.', href: '/account' },
      { title: 'Steady icon search width', detail: 'Changing profile icon categories keeps the search field the same width.', href: '/account' },
      { title: 'Tall planner cards stay seamless', detail: 'The portrait background fills tall operator cards without an outer border or a strip below the artwork.', href: '/operator-planner' },
    ],
  },
  {
    at: '2026-10-23T23:30:00Z',
    added: [
      { title: 'PVs on event pages', detail: "Each event has a PVs tab with its official trailer, PVs and EPs from YouTube, and a rerun lists its launch's too.", href: '/schedule' },
    ],
  },
  {
    at: '2026-10-23T15:30:00Z',
    changed: [
      { title: 'Synergies as cards', detail: 'Each faction or class is a card with its emblem, the buffs it grants and who it reaches; a card opens its record.', href: '/synergies' },
      { title: 'Techniques as cards', detail: 'Each technique is a card with its definition and operators; filter by kind, rarity, class, source or sort.', href: '/techniques' },
    ],
    fixed: [
      { title: 'A name is not a buff', detail: 'Vina Victoria no longer grants a Victoria synergy just by being named; an operator\'s name is not a mention of the faction.', href: '/synergies' },
    ],
  },
  {
    at: '2026-10-23T08:30:00Z',
    added: [
      { title: 'Queue from Most liked on YouTube', detail: 'Each Most liked tile has a ⋯ menu to play its song next or add it to the queue.', href: '/music/discover' },
    ],
    changed: [
      { title: 'Seek on Discover', detail: 'Drag the player head on Discover, as on the other music tabs.', href: '/music/discover' },
      { title: 'Background play notes', detail: 'Songs played from YouTube may not keep playing properly in the background on phones; the notes no longer say they stop.', href: '/music' },
      { title: 'Monster Siren songs start sooner', detail: 'Pressing Next, or reaching the end of a song, starts the next Monster Siren song sooner.', href: '/music' },
    ],
    fixed: [
      { title: 'Queue new songs without reloading', detail: 'Songs added to the site while a page was open can now be queued without reloading it.', href: '/music' },
    ],
  },
  {
    at: '2026-10-22T20:30:00Z',
    added: [
      { title: 'Arknights: Endfield music', detail: 'Tick Endfield music beside Playlists to add Endfield\'s soundtrack to the player, Library and Discover.', href: '/music/discover' },
      { title: 'Search "endfield" for its music', detail: 'The site search, Discover and the Library find Endfield\'s albums and songs by the game\'s name.', href: '/search' },
    ],
    fixed: [
      { title: 'Monthly Card and Look Back days tick', detail: 'Recommended Monthly Card and To Look Back on Terra days you claimed in game are ticked after an import.', href: '/free-op' },
    ],
  },
  {
    at: '2026-10-21T19:30:00Z',
    added: [
      { title: 'Search YouTube and Twitch', detail: 'The site search also finds Arknights creators, their latest videos and live Twitch streams.', href: '/search' },
      { title: "Leave out stages you can't clear", detail: 'The reward tracker can leave out Challenge Mode, H stages, Adverse Environment and S stages, each on its own.', href: '/free-op' },
      { title: 'Welfare operator cards', detail: 'The welfare operators you can still get, from Record Restoration and open events, as picture cards.', href: '/free-op' },
      { title: 'Artists and voice actors, filterable', detail: 'Search, language, rarity, class, faction and Global or CN only, with A–Z groups; one card per person.', href: '/voice-actors' },
      { title: 'Arknights at conventions', detail: 'Global conventions presenting an Arknights guest, such as Namie at AFA Singapore, and fan gatherings.', href: '/community' },
      { title: 'Endfield offline events', detail: 'Pop-ups, the gamescom asia booth, Round1 and the first-anniversary festivals in Japan and Korea.', href: '/community' },
      { title: 'Korean collabs and fan contests', detail: 'Banolim Pizza, animate cafe and the official fan contests and social events in Korea.', href: '/community' },
    ],
    fixed: [
      { title: 'JP and KR list everything Global does', detail: 'Upcoming events, predicted banners and the same order as Global, on that server\'s own dates.', href: '/schedule' },
      { title: 'Adverse Combat counts as Adverse Environment', detail: 'Leaving out Adverse Environment also leaves out the newer chapters\' Adverse Combat stages.', href: '/free-op' },
      { title: 'Account import ticks more rewards', detail: 'Event and Archive missions, Record Restoration, sign-ins and welfare operators in your roster are ticked.', href: '/free-op' },
      { title: 'Lighter event pages', detail: 'Event pages load much less data.' },
      { title: 'Character icons in music', detail: "Characters credited under a different spelling, such as Kal'tsit Esperanta, show their icon.", href: '/music/discover' },
      { title: 'Many chibis at once', detail: 'More than 15 chibis on a page no longer turn into blank boxes, and a tapped chibi keeps its size.' },
      { title: 'Imports tick beginner rewards', detail: 'Beginner missions and sign-in days the save records as claimed are ticked and locked.', href: '/free-op' },
      { title: 'Event and beginner sign-ins tick on import', detail: 'Sign-in days you claimed in game, for events and the beginner programme, are ticked after an import.', href: '/free-op' },
      { title: 'Imports keep every claim', detail: 'A long-played account\'s imported claims are no longer dropped when the page reloads.', href: '/free-op' },
      { title: 'Imports untick what is not done', detail: 'A manual tick on something your save shows as not done is removed on the next import.', href: '/free-op' },
      { title: 'Chibi glows drawn right', detail: "Soft glows and edges, such as behind Kal'tsit the Esperanta, no longer show as bright blocks on about 120 operators' chibis." },
      { title: 'Home page holds still', detail: 'The Community panel keeps its height as it turns, and stops turning under the pointer.', href: '/' },
    ],
    changed: [
      { title: 'Welfare operators name the stage', detail: 'Cards in both views say what to clear; permanent main-story missions such as Viy\'s stay listed.', href: '/free-op' },
      { title: 'Filters fold away on phones', detail: 'On a phone, list filters open from one Filters button, and active ones show as chips.', href: '/operators' },
      { title: 'Web events by server', detail: 'Global, JP and KR web events each have their own column.', href: '/community' },
      { title: "JP and KR show Global's art for now", detail: "Dates follow that server; art, news and web events stay Global's until the site is translated.", href: '/schedule' },
      { title: "Classes in the game's order", detail: 'Operator lists sort classes as the game does: Vanguard, Guard, Defender, Sniper, Caster, Medic, Supporter, Specialist.', href: '/operators' },
      { title: 'Sign-in not saved unless you ask', detail: 'Account import keeps your sign-in in this browser only when you tick Save this sign-in.', href: '/account' },
    ],
  },
  {
    at: '2026-10-19T22:30:00Z',
    added: [
      { title: 'Base skill keywords explained', detail: 'Tap or hover an underlined term, such as Closure\'s Special Order or Worldly Plight, for the game\'s own explanation.' },
      { title: "Don't autoplay a song", detail: 'Mark songs you never want autoplay to pick; they still play when you choose them.', href: '/music' },
      { title: 'YouTube button in the player', detail: 'Open the song playing on YouTube from the player bar or its More menu.', href: '/music' },
      { title: 'Switch server from the clock', detail: 'Click the reset time in the top bar to show the whole site in Global, Japan or Korea time.' },
      { title: 'Server maintenance on the home page', detail: 'Maintenance from the in-game notices shows above the panels and in the ticker, for the server you are viewing.', href: '/' },
      { title: 'Event dates and art from the game', detail: 'Events show their announced day and key art as soon as the in-game board posts them.', href: '/schedule' },
      { title: 'Pictures in event news', detail: 'Event News shows the official posts\' pictures where they stand, with the board\'s banner art.' },
    ],
    changed: [
      { title: 'Recruitment rarity at a glance', detail: 'Each operator box in recruitment results is tinted with its rarity colour.', href: '/recruitment' },
      { title: 'Farming guide updated', detail: 'New EN recommendations, including Electrode Unit and Liquefied High-Energy Gas.', href: '/farming' },
      { title: 'Autoplay on by default', detail: 'Autoplay from your library is on unless you turn it off.', href: '/music' },
      { title: 'Show all always in reach', detail: 'Section headings on Discover stay at the top while you scroll a long list.', href: '/music/discover' },
      { title: 'JP and KR banner days confirmed', detail: 'Their opening day is checked against the in-game board.', href: '/pulls' },
      { title: 'Stat icons from the game', detail: 'Enemy and operator stat icons now come from the game client itself.', href: '/enemies' },
    ],
    fixed: [
      { title: 'All outfits on sale on Global', detail: 'Skins on the home page and Available now list every outfit in Global\'s store, new and returning, as for JP and KR.', href: '/skins' },
      { title: 'Chibi glow effects', detail: 'Glowing effects such as Mudrock\'s Silent Night candles draw softly instead of as solid blobs.', href: '/operators' },
    ],
  },
  {
    at: '2026-10-19T04:10:00Z',
    added: [
      { title: 'Search the whole site', detail: 'Press Ctrl+K (⌘K on a Mac), "/" or the magnifier to find operators, events, stages, enemies, songs and pages as you type.', href: '/search' },
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
