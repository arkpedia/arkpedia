/**
 * The stage map's HUD: the game's own glyphs, and the chips they sit in.
 *
 * Lifted out of pages/stages/[slug].tsx, which was 1,518 lines and held these three
 * components, the description parser and the roster's rank order alongside the page
 * itself. Nothing here knows what a stage is -- a label, a value and which glyph to
 * draw is the whole interface -- so it reads as the presentational unit it is.
 */
/**
 * The game's own glyph for a figure, where the game uses one instead of a word.
 * public/stat-icons/, imported by scripts/import-stat-icons.py.
 *
 * COST is white-on-alpha, so it masks and takes the colour of whatever it sits in --
 * which matters for the DP chip, whose text is already tinted. Sanity is the AP
 * medallion in full colour and cannot be masked without losing it, so that one is
 * drawn as an image.
 */
export type GlyphName = 'cost' | 'sanity' | 'life' | 'enemies' | 'squad';

/**
 * Art that keeps its own colours: the sanity medallion, and the life-point marker,
 * which is two-tone -- red brackets around a WHITE rook. Neither can go through a
 * mask, which keeps only the alpha and paints the whole shape one colour: it turned
 * the rook red along with its brackets. The enemy page's own icons make the same
 * distinction, for the same file.
 */
const OWN_COLOURS: Partial<Record<GlyphName, string>> = {
  sanity: '/stat-icons/sanity.webp',
  // The game's own life-points mark: a white rook in blue brackets. It replaces the
  // enemy page's rook, which was the same art in RED and had to be turned 205 degrees
  // to read as life rather than as a life cost. The enemy page keeps its own copy and
  // its own filter -- this is the stage view's icon only.
  life: '/stat-icons/life.webp',
  // The wiki's enemy-count marker, which is the only place it exists as a file. Colour
  // art like the two above, so it goes through the same path.
  enemies: '/stat-icons/enemies.webp',
};

export function StatGlyph({ name }: { name: GlyphName }) {
  const own = OWN_COLOURS[name];
  if (own) {
    return <span className="stage-stat-glyph in-colour" style={{ backgroundImage: `url(${own})` }} />;
  }
  const url = `url(/stat-icons/${name}.webp)`;
  /* data-glyph so CSS can size one that is not square: the squad mark is 88x115, and
     in the square box the others use it came out squashed. */
  return <span className="stage-stat-glyph" data-glyph={name} style={{ maskImage: url, WebkitMaskImage: url }} />;
}

/**
 * The label goes to an icon where one exists, but the word still has to be readable
 * to a screen reader and on hover -- an icon alone would leave "6" with nothing
 * saying what six of.
 */
export function StatLabel({ label, icon }: { label: string; icon?: GlyphName }) {
  if (!icon) return <>{label}</>;
  return (
    <>
      <StatGlyph name={icon} />
      <span className="stage-stat-label-text">{label}</span>
    </>
  );
}

/**
 * One reading in the map's HUD.
 *
 * `tone` is for the two the game itself colours: the life points, which is the
 * thing you lose, and DP, which is the thing you spend. `wide` lets a
 * recommended level ("Elite 2 Lv. 20") stay on one line, where every other
 * value here is a number. `icon` puts the game's glyph where the word was.
 */
export function HudChip({ label, value, tone, wide, icon, iconLeft, reserved }: { label: string; value: string; tone?: 'life' | 'dp'; wide?: boolean; icon?: GlyphName; iconLeft?: boolean; reserved?: boolean }) {
  const classes = [
    'stage-hud-chip',
    tone,
    wide && 'wide',
    // Holds its space without showing anything -- see the recommended slot below.
    reserved && 'reserved',
    // A glyph is art with no baseline, so a chip holding one centres its parts
    // instead of sitting them on a line that does not exist.
    icon && 'has-glyph',
    // The glyph reads beside the figure rather than over it, which is where the game
    // puts a DP cost.
    iconLeft && 'icon-left',
  ].filter(Boolean).join(' ');
  return (
    <span className={classes} title={icon ? label : undefined}>
      <span className="stage-hud-label">
        <StatLabel label={label} icon={icon} />
      </span>
      {/* A reserved slot needs its value LINE, not just its label, or it stands
          shorter than the chip it is holding space for and the reading above it still
          moves -- by 14px, which is most of the point of reserving it. */}
      <span className="stage-hud-value">{reserved && !value ? ' ' : value}</span>
    </span>
  );
}

/**
 * The fullscreen toggle's arrows: out to the top-left and bottom-right corners to
 * enter, back in from them to leave.
 *
 * Here rather than in the page because it is the same kind of thing as the glyphs
 * above -- presentation with no idea what a stage is -- and the page it serves is
 * long enough already. Drawn rather than a file: it is four strokes, and an icon that
 * inherits currentColor sits in a button whose colour the button decides.
 */
export function ExpandGlyph({ leaving }: { leaving?: boolean }) {
  return (
    <svg
      className="stage-expand-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {leaving ? (
        <>
          {/* Brackets at the inner ends, so the arrows read as pointing inward. */}
          <path d="M10 4v6H4" />
          <path d="M4 4l6 6" />
          <path d="M14 20v-6h6" />
          <path d="M20 20l-6-6" />
        </>
      ) : (
        <>
          <path d="M4 9V4h5" />
          <path d="M4 4l6 6" />
          <path d="M20 15v5h-5" />
          <path d="M20 20l-6-6" />
        </>
      )}
    </svg>
  );
}

/**
 * The bar the game puts across the top of a battle: the readings side by side in one
 * plate with a rule between them, rather than as separate chips. Enemies and life go
 * here because that is where the game keeps them, and because "0/43" beside "3" reads
 * as one status line -- which is what it is.
 */
export function HudBar({
  items,
}: {
  items: { icon: GlyphName; label: string; value: string; width?: number }[];
}) {
  return (
    <span className="stage-hud-bar">
      {items.map((item) => (
        <span key={item.label} className="stage-hud-bar-item" title={item.label}>
          <StatGlyph name={item.icon} />
          {/* `width` reserves the widest the reading will ever be, in digits. The plate
              is centred over the map, so a counter going from 9/41 to 10/41 shifted
              everything in it by half a character, once a second, for the whole
              fight. Digits are tabular below, which makes a ch exactly one of them. */}
          <span
            className="stage-hud-bar-value"
            style={item.width ? { minWidth: `${item.width}ch` } : undefined}
          >
            {item.value}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * DP, the way the game draws it: the figure large in the bottom-right corner with the
 * cost glyph beside it, and the deployment limit spelled out underneath. The one
 * reading a player watches constantly, so it is the one reading that gets size.
 */
export function HudDp({ value, limit, width }: { value: string; limit?: string; width?: number }) {
  return (
    <span className="stage-hud-dp-block">
      <span className="stage-hud-dp" title="DP">
        <StatGlyph name="cost" />
        {/* Room for the stage's ceiling, so climbing from 9 to 10 to 100 does not walk
            the glyph beside it left across the map. */}
        <span
          className="stage-hud-dp-value"
          style={width ? { minWidth: `${width}ch` } : undefined}
        >
          {value}
        </span>
      </span>
      {limit && <span className="stage-hud-limit">Unit Limit: {limit}</span>}
    </span>
  );
}
