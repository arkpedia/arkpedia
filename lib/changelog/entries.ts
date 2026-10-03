/*
 * What's new on the site (pages/changelog.tsx), newest first, in the reader's words: what
 * they can now do, what works differently, and what was broken and is not. Written at each
 * release to the main site, for what that release brings, so the date is the day readers got
 * it. Not every merge: tests, CI and internals stay out (scripts/tests/test-changelog.ts holds
 * the shape).
 */

export interface ChangeItem {
  text: string;
  /** A page on the site the change is about, for a reader to go and see it. */
  href?: string;
}

export interface ChangelogEntry {
  /** The day the release reached the site, YYYY-MM-DD. */
  date: string;
  /** A short name for the release, when it has a theme. */
  title?: string;
  added?: ChangeItem[];
  changed?: ChangeItem[];
  fixed?: ChangeItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-10-03',
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

/** The newest entry's date: what "seen" is measured against (lib/changelog/seen.ts). */
export const LATEST_CHANGE = CHANGELOG[0]?.date ?? '';
