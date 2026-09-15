/** Canonical routes; games are listed below only when their pages are present. */
export const GAME_PATHS = {
  operator: '/games/operator-guesser',
  music: '/games/music-guesser',
  palette: '/games/color-palette',
  recruitment: '/games/recruitment-guesser',
  stage: '/games/stage-guesser',
} as const;

/** Shared by the Games hub, in-game links, and site navigation. */
export const GAMES = [
  // Operator games.
  {
    href: GAME_PATHS.operator,
    name: 'Operator Guesser',
    shortName: 'Operator',
    icon: 'guesser',
    description: 'Name the operator from a growing set of clues. Choose which hints you want to play with.',
  },
  // Music games.
  {
    href: GAME_PATHS.music,
    name: 'Music Guesser',
    shortName: 'Music',
    icon: 'music',
    description: 'Recognize a song from a short clip. Play with track titles, event connections, or character connections.',
  },
  // Visual and recruitment games.
  {
    href: GAME_PATHS.palette,
    name: 'Color Palette',
    shortName: 'Color Palette',
    icon: 'theme',
    description: 'Five colors, one operator. Choose Base or Elite 2 artwork, with optional rarity and class hints.',
  },
  {
    href: GAME_PATHS.stage,
    name: 'Stage Guesser',
    shortName: 'Stage',
    icon: 'stages',
    description: 'Recognize battlefields from their tile layouts. Unlock the in-game image, then the chapter or event.',
  },
  {
    href: GAME_PATHS.recruitment,
    name: 'Recruitment Guesser',
    shortName: 'Recruitment',
    icon: 'recruitment',
    description: 'Read the recruitment tags and name every possible operator. Each challenge has at most three answers.',
  },
] as const;

export function isGamePath(pathname: string): boolean {
  return pathname === '/games' || pathname.startsWith('/games/');
}
