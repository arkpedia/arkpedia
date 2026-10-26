/** kukkikaze's recommendations, supplied by the site owner from the linked guide. */
export const WELFARE_GUIDE = 'https://www.youtube.com/watch?v=TRb4_fCVyhk';
export const WELFARE_PRIORITIES = [
  ['Gladiia', 'Tequila', 'Kroos the Keen Glint', 'Lumen', 'Rose Salt'],
  ['Robin', 'Puzzle', 'Wanqing', 'Crownslayer', 'Sankta Miksaparato', 'Matsukiri'],
  ['Absinthe', 'Heavyrain', 'Bena', 'Wild Mane', 'Kjera', 'Czerny', 'Minimalist', 'Astgenne', 'Vigil', 'Silence the Paradigmatic', 'Insider', 'Coldshot', 'Lessing', 'Harold', 'Underflow', 'Papyrus', 'Brigid', 'Astgenne the Lightchaser'],
  ['Grani', 'Flamebringer', 'Ceylon', 'Bison', 'Snowsant', 'Folinic', 'Sideroca', 'Tomimi', 'Mint', 'Whislash', 'Lava the Purgatory', 'Enforcer', 'Jieyun', 'Odda', 'Catherine', 'Xingzhu', 'Miss.Christine'],
] as const;

const priorities = new Map<string, number>(WELFARE_PRIORITIES.flatMap((names, index) => names.map(name => [name, index + 1] as const)));
/** New/unlisted operators remain unranked rather than inheriting a recommendation. */
export const welfarePriority = (name: string): number | undefined => priorities.get(name);
