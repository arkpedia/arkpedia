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
    at: '2026-10-11T10:11:00Z',
    title: 'Outfits and supporters',
    changed: [
      { title: 'Sliding outfit captions', detail: 'Outfit names and prices slide and fade together when switching artwork, with a still transition for reduced motion.', href: '/operators' },
      { title: 'Patreon supporters', detail: 'Updated supporter acknowledgements across all five Patreon tiers.', href: '/support' },
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
    ],
    changed: [
      { title: 'Official event details update automatically', detail: 'Global notices update rewards, packs and selector pools, while artwork refreshes retry missing images without losing progress.', href: '/events' },
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
      { title: 'Mastery priority guide beside Skills', detail: 'Open mastery recommendations from the right side of the Skills heading, with a shorter label on phones.', href: '/operators' },
      { title: 'Battle chibi viewer', detail: 'Inspect an outfit’s battle animations, switch facing, pause playback or drag the chibi around the page.', href: '/operators' },
      { title: 'Artists and voice actors', detail: 'Search the credit databases and open the operators linked to each artist or voice actor.', href: '/artists' },
      { title: 'Operator summon stats', detail: 'Summons show their base stats at the selected promotion and level, before operator skill and talent bonuses.', href: '/operators' },
      { title: 'World community sections', detail: 'Browse creator feeds and community links, with country filters for offline events.', href: '/community' },
    ],
    changed: [
      { title: 'Roaming chibis stay with you', detail: 'A dragged-out chibi keeps walking after you close its viewer or change pages, until you dismiss it.', href: '/operators' },
      { title: 'Home page stage and countdown colors', detail: 'Open stages and Starts in are green, closed stages are red, and Ends in is yellow.', href: '/' },
      { title: 'Skin Planner shop sections', detail: 'Browse open shop sections with cards and artwork loading as you scroll, and owned outfits last.', href: '/skin-planner' },
      { title: 'Recruitment language and text size', detail: 'Choose EN, JP, KR or CN tag labels and your text size, including in the pop-out window.', href: '/recruitment' },
      { title: 'Operator Planner selections', detail: 'Simple mode offers Missing and All, and the selected-goal summary follows its filters.', href: '/planner' },
      { title: 'Monthly yellow-certificate budgets', detail: 'Plan each month’s sequential shop tiers with one shared certificate balance, including months you skip.', href: '/pulls' },
      { title: 'Pull History exports by banner', detail: 'Save a separate CSV for each banner, alongside the full-history export.', href: '/account' },
      { title: 'Operator EP and outfit voice selection', detail: 'Play an operator’s EP first in the music queue and choose special outfit voice lines directly.', href: '/operators' },
      { title: 'Clock follows the selected account', detail: 'Server time and the daily reset follow your selected EN, JP or KR account.', href: '/account' },
    ],
    fixed: [
      { title: 'Upcoming skins and returning shops', detail: 'Upcoming outfits follow their acquisition dates, and partial shop announcements keep other returning batches.', href: '/skins' },
      { title: 'Shared effects in animated art', detail: 'Kal’tsit - Esperanta’s warning screens and other effects now play with their animations.', href: '/operators' },
      { title: 'Stable still and animated artwork framing', detail: 'Switching to animated art keeps the same zoom and position, including Haruka’s Stranded In Utopia.', href: '/skins' },
      { title: 'Dialogue and extra layers in animated art', detail: 'Exusiai and Kal’tsit play their authored dialogue poses, and Haruka’s extra layer plays with her artwork.', href: '/skins' },
      { title: 'Phone layouts and outfit voice controls', detail: 'Operator and credit pages stay within the screen, and outfit voice selection keeps the line you are reading in place.', href: '/operators' },
      { title: 'Operator acquisition labels', detail: 'Adnachiel, Purestream and Estelle are marked recruitment-only; Steward is not.', href: '/operators' },
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
