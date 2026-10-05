/*
 * What's new on the site (pages/changelog.tsx), newest first, in the reader's words: what
 * they can now do, what works differently, and what was broken and is not. Written at each
 * release to the main site, for what that release brings. Not every merge: tests, CI and
 * internals stay out (scripts/tests/test-changelog.ts holds the shape).
 */

export interface ChangeItem {
  text: string;
  /** A page on the site the change is about, for a reader to go and see it. */
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
    at: '2026-10-05T08:26:00Z',
    title: 'Event pages, CN announcements, and back buttons',
    added: [
      { text: 'Every reward an event gives, not only its store: login events, gifts, missions, first-clear rewards, milestone tracks for game modes like Duel Channel, the packs on sale with what is in them, and the event\'s furniture set with where each piece comes from.', href: '/schedule' },
      { text: 'An All tab on each event\'s rewards: the free rewards as one card, by kind, with Copy link and Save image to share it.', href: '/schedule' },
      { text: 'Reruns list their own store and rewards, and events Global has not had yet list what they gave on CN.', href: '/schedule' },
      { text: 'New CN events and banners appear the day they are announced on the official CN site, with the announced rate-up operators, about a week before the game\'s data has them. Clementia\'s banner and the SideStory 昨日海 are the first.', href: '/schedule' },
      { text: 'A Back button on event, operator and stage pages. It returns to the page you came from, or to the list when you opened the page from a link.' },
    ],
    changed: [
      { text: 'Event pages: the event art runs across the top and the sections use the full width below it. The All summary is compact cards of icons and counts.', href: '/schedule' },
      { text: 'Operator pages: searching for another operator opens it on the section you were reading, such as Base skills.', href: '/operators' },
      { text: 'Every Back button on the site looks the same.' },
      { text: 'Operator skills, talents and modules are rebuilt from the game\'s own data every night. Operators not out on Global yet show their modules from the CN game until Global has them.', href: '/operators' },
      { text: 'Techniques: modules that reveal invisible enemies are listed, operator traits are read too, and Hunters are no longer listed as ammo-based.', href: '/techniques' },
      { text: 'On a phone, the menu button and the theme toggle sit in the bar without boxes around them.' },
    ],
    fixed: [
      { text: 'Event rewards: no section lists the same rewards twice, game modes no longer show first-clear Originite Prime they do not give, and every reward has its real name.', href: '/schedule' },
      { text: 'Event rewards show their art: profile icons, furniture, and items like Expedited Plan that showed only a name.', href: '/schedule' },
      { text: 'The rewards summary no longer lists Orundum, Originite Prime and permits a second time.', href: '/schedule' },
    ],
  },
  {
    at: '2026-10-03T12:10:00Z',
    title: 'Your account, the planners, and the story',
    added: [
      { text: 'Import your Arknights Global account: sign in with your Yostar email code and the site reads your operators, outfits, materials, cleared stages and profile. It is kept in your browser only.', href: '/account' },
      { text: 'Your profile card, drawn the way the game draws it: your support units (tap the arrows to see them full length, with module and skill), your hiring count or percentage, and your card theme.', href: '/account' },
      { text: 'Owned and Not owned filters, with counts, on Operators, Skins and the Skin Planner, from your import.', href: '/operators' },
      { text: 'Skin Planner: plan the outfits you want by shop and price. Your wishlist is shared with the Skins page and the Pull Planner.', href: '/skin-planner' },
      { text: 'OP Tracker: the Originite Prime and Orundum the game still owes you for first clears, ticked off from your import.', href: '/free-op' },
      { text: 'Story page: Timo\'s story reader, and the community Arknights Story Map, where every story opens at its first chapter. It has full screen, and a list view for phones.', href: '/story' },
      { text: 'Manga page: every official comic from the Global site, with links to read each one.', href: '/manga' },
      { text: 'One Import / export on the Import Account page, including a backup of all your planner data.', href: '/account' },
      { text: 'This What\'s new page.' },
    ],
    changed: [
      { text: 'Pull Planner: an import fills in your Orundum, Originite Prime, permits and yellow certs. Income, Past events and the Skin wishlist open as popups, and Past events can be filtered to Unclaimed or Claimed.', href: '/pulls' },
      { text: 'Pull Planner: Your banners is budgeted through your last banner automatically, and a new Include box decides whether your skin wishlist holds OP back.', href: '/pulls' },
      { text: 'Operator Planner (Experimental): two views, Missing and All. Craft adds what a material is made of to the list, each material says how much is for upgrades and how much for crafting, and you can adjust what you hold right in the recipe.', href: '/planner' },
      { text: 'The Planner menu: Import Account, OP Tracker, Operator Planner, Skin Planner and Pull Planner.' },
      { text: 'Base: the room picker offers the operators you own, at your elite.', href: '/base' },
      { text: 'Events are listed by release date, and the permanent Annihilations are listed with their certificates.' },
      { text: 'On a phone, the menu button is on the left and the menu folds into sections.' },
    ],
    fixed: [
      { text: 'The Pull Planner no longer crashes when some of its data is missing.' },
      { text: 'The Skin Planner shows every outfit\'s art again.' },
      { text: 'Popups scroll once, with their header staying put, instead of two scroll bars.' },
      { text: 'Links in page text stay teal after you have opened them.' },
      { text: 'The music player is no longer cut off on desktop.' },
    ],
  },
];

/** The newest entry's moment: what "seen" is measured against (lib/changelog/seen.ts). ISO UTC
 *  instants compare as strings in time order. */
export const LATEST_CHANGE = CHANGELOG[0]?.at ?? '';
