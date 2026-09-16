import { ContentImg } from '@/components/content/ContentImage';
/**
 * The glyphs the in-game enemy handbook puts beside each stat.
 *
 * Mixed provenance, and the comments say which is which.
 *
 * MOST ARE NOW THE GAME'S OWN ART. HP, ATK, DEF, RES, ASPD and Block come out of the
 * UI atlas via scripts/imports/import-stat-icons.py into public/stat-icons/; movement speed
 * and the life-point marker are older PNGs under public/enemy-stat-icons/.
 *
 * They used to be drawn here, because the handbook's icons live in a sprite atlas
 * that none of the mirrors this project pulls from publishes as files: cn-resource
 * has skill/item/map art, yuanyan3060 and Aceship have character and enemy art,
 * akgcc/arkdata's spritepack carries atlases for items, potentials and
 * sub-professions but nothing for the handbook, and neither arknights.wiki.gg nor
 * prts.wiki uses stat icons on its enemy pages at all. Eltik/myrtle does publish
 * them, which is what closed that gap.
 *
 * Still drawn, for want of a source: Elemental RES and Effect Res (the atlas mirror
 * has no elemental pair), Weight, Taunt and Silence. Those last two are not handbook
 * stats at all, so the game has no glyph to follow. They are SOLID, because the
 * game's are solid and a 1.6px outline at 15px read as a different set of icons
 * entirely.
 *
 * Everything here, drawn or imported, takes the colour of whatever it sits beside --
 * faint next to a stat label, red next to the life-point figure -- and works on both
 * themes: `fill="currentColor"` for the drawn ones, a CSS mask for the art.
 */
/**
 * Three of these are the game's own art, supplied as PNG rather than drawn: ASPD, the
 * movement-speed boot, and the life-point marker. They render as a CSS MASK rather
 * than an <ContentImg>, which keeps the file's exact shape while the colour comes from
 * currentColor -- so they sit at --text-faint beside a stat label, turn red beside the
 * life-point figure, and still work on the light theme. A white <ContentImg> could do none of
 * that.
 *
 * Set inline rather than in the stylesheet so the url stays next to the icon it
 * belongs to.
 */
function art(file: string) {
  const url = `url(/enemy-stat-icons/${file})`;
  return <span className="enemy-stat-glyph" style={{ maskImage: url, WebkitMaskImage: url }} />;
}

/**
 * The same masking, for the handbook glyphs the game actually draws: HP, ATK, DEF,
 * RES, ASPD and Block. These were drawn by hand here until a mirror turned up that
 * publishes the UI atlas as files -- see scripts/imports/import-stat-icons.py, which is what
 * puts them in public/stat-icons/. They are 26px white-on-alpha, so they mask exactly
 * like the three older PNGs and take currentColor the same way.
 */
function statArt(file: string) {
  const url = `url(/stat-icons/${file})`;
  return <span className="enemy-stat-glyph" style={{ maskImage: url, WebkitMaskImage: url }} />;
}

/**
 * The same art drawn in its own colours instead of masked. For the life-point marker,
 * which is two-tone -- red brackets around a WHITE rook -- and so cannot go through a
 * mask: a mask keeps only the alpha and paints the whole shape one colour, which
 * turned the rook red along with the brackets.
 *
 * The trade is that this one cannot follow the theme the way the masked glyphs do; the
 * rook stays white because that is what the art is.
 */
function artInOwnColours(file: string) {
  const url = `url(/enemy-stat-icons/${file})`;
  return <span className="enemy-stat-art" style={{ backgroundImage: url }} />;
}

const solid = {
  viewBox: '0 0 20 20',
  fill: 'currentColor',
  stroke: 'none',
  'aria-hidden': true as const,
};

export const STAT_ICONS: Record<string, JSX.Element> = {
  hp: statArt('hp.webp'),
  atk: statArt('atk.webp'),
  def: statArt('def.webp'),
  res: statArt('res.webp'),
  // The boot: shaft on the right, sole out to the left over a ground bar.
  move_speed: art('movement-speed.png'),
  attack_speed: statArt('aspd.webp'),
  // Shield with a hollow core -- the elemental variant of the DEF shield.
  elemental_res: (
    <svg {...solid} fillRule="evenodd" clipRule="evenodd">
      <path d="M10 2.6 17 5.4v4.4c0 3.7-2.8 6.5-7 7.6-4.2-1.1-7-3.9-7-7.6V5.4zm0 4.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z" />
    </svg>
  ),
  // A ring wound into a spiral.
  elemental_damage_res: (
    <svg {...solid} fillRule="evenodd" clipRule="evenodd">
      <path d="M10 2.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2zm0 1.9a5.7 5.7 0 1 1 0 11.4 5.7 5.7 0 0 1 0-11.4z" />
      <path d="M10 6.6a3.4 3.4 0 1 1-3.4 3.4h1.7a1.7 1.7 0 1 0 1.7-1.7z" />
    </svg>
  ),
  // A hanging weight: handle over a tapered block.
  weight: (
    <svg {...solid} fillRule="evenodd" clipRule="evenodd">
      <path d="M10 2.6a2.9 2.9 0 0 0-2.9 2.9h1.8a1.1 1.1 0 1 1 2.2 0h1.8A2.9 2.9 0 0 0 10 2.6z" />
      <path d="M5.6 6.6h8.8L16.2 17H3.8z" />
    </svg>
  ),
  block: statArt('block.webp'),
  /* The game's block glyph struck through, for an enemy nothing can block. There is
     no such glyph in the game -- it is a state the handbook states in words -- so
     the bar is drawn over the real icon rather than the whole thing redrawn. */
  block_none: (
    <span className="enemy-stat-glyph-stack">
      {statArt('block.webp')}
      <svg {...solid} className="enemy-stat-strike">
        <path d="M1.9 16.7 16.7 1.9l1.5 1.5L3.4 18.2z" />
      </svg>
    </span>
  ),
  /* Taunt: a crosshair, for the priority a blocker's attention lands on. Not a
     handbook stat, so there is no in-game glyph to follow -- distinct from the RES
     rhombus and the Effect Res ring so the three do not read as a set. */
  taunt: (
    <svg {...solid} fillRule="evenodd" clipRule="evenodd">
      <path d="M10 3.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8zm0 1.8a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2z" />
      <path d="M9.1 1.4h1.8v3.1H9.1zM9.1 15.5h1.8v3.1H9.1zM1.4 9.1h3.1v1.8H1.4zM15.5 9.1h3.1v1.8h-3.1z" />
      <circle cx="10" cy="10" r="1.7" />
    </svg>
  ),
  // The life-point marker: the brackets and the rook between them, one file.
  life_cost: artInOwnColours('topper-rook.png'),
  // The marker the game puts on an ability that Silence switches off.
  silence: (
    <svg {...solid}>
      <path d="M4.6 3.2 16.8 15.4l-1.4 1.4L3.2 4.6z" />
      <path d="M15.4 3.2l1.4 1.4L4.6 16.8l-1.4-1.4z" />
    </svg>
  ),
};
