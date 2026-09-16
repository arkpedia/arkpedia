import Image from '@/components/content/ContentImage';

/**
 * An enemy's attack range, drawn the way the game measures it: a tile grid with the
 * enemy on the centre tile and a circle of the given radius over it.
 *
 * The radius is in tiles, from gamedata's rangeRadius. Values run 0.0 to 99.0 -- 2.0
 * and 2.5 are the commonest, and four enemies (Shrine Marksman and friends) carry 99,
 * which is the game's way of saying "anywhere". A circle of 99 tiles cannot be drawn
 * to scale next to one of 2, so anything from UNBOUNDED_AT up says so in words instead
 * of pretending to a picture.
 *
 * A tile is shaded when the range circle would touch an operator deployed on it. An
 * operator stands at the tile's centre but occupies a body, not a dot, so the test is
 * circle against circle: centre-to-centre distance within radius + OPERATOR_FOOTPRINT.
 *
 * The footprint matters more than it looks. Treating the operator as a point shades 5
 * tiles at radius 1; treating the whole tile as fair game -- which is a footprint of
 * 0.707, the distance out to a tile's corner -- shades all 9, and 45 of 49 at radius
 * 3, marking safe tiles dangerous. At 0.35, roughly the sprite's base, those come out
 * 5 and 37.
 *
 * One consequence to expect: at radius 2 the ring at hypot(2,1) = 2.24 is only 0.24
 * outside the circle, so any footprint at all brings it in. 13 tiles become 21 there,
 * and that is the footprint doing its job rather than a bug.
 */
const UNBOUNDED_AT = 15;

/**
 * How much of a tile a deployed operator takes up, as a radius in tiles. Roughly the
 * base of the sprite: half a tile (0.5) would have the body filling its square edge to
 * edge, and 0.707 would have it reaching the corners.
 */
const OPERATOR_FOOTPRINT = 0.35;

/** One tile is one unit in the viewBox, so the maths is in tiles throughout. */
function grid(radius: number) {
  const reach = radius + OPERATOR_FOOTPRINT;
  // Sized by the radius, not the reach. Every lit tile still fits -- a tile is lit only
  // at an integer offset within `reach`, and floor(radius + 0.35) never exceeds
  // ceil(radius) -- while sizing by the reach pushed small ranges into a grid a ring
  // too wide, leaving 5 tiles lit inside 25 at radius 1.
  const half = Math.ceil(radius);
  const side = half * 2 + 1;
  const centre = side / 2;
  const tiles: { x: number; y: number; covered: boolean }[] = [];
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      // Where an operator deployed on this tile would stand, and whether the range
      // circle reaches their body from there.
      const dx = x + 0.5 - centre;
      const dy = y + 0.5 - centre;
      tiles.push({ x, y, covered: Math.hypot(dx, dy) <= reach });
    }
  }
  return { side, centre, tiles };
}

export default function EnemyRangeMap({
  radius,
  icon,
  name,
}: {
  radius: number;
  icon: string | null;
  name: string;
}) {
  if (radius >= UNBOUNDED_AT) {
    return (
      <div className="enemy-range">
        <p className="hint enemy-range-note">
          Range {radius} — the whole field. Gamedata uses a figure this large for an
          enemy with no practical limit, so there is nothing to draw to scale.
        </p>
      </div>
    );
  }

  const { side, centre, tiles } = grid(radius);

  return (
    <div className="enemy-range">
      <div className="enemy-range-map" style={{ '--range-side': side } as React.CSSProperties}>
        <svg viewBox={`0 0 ${side} ${side}`} aria-hidden="true">
          {tiles.map((t) => (
            <rect
              key={`${t.x}-${t.y}`}
              x={t.x + 0.06}
              y={t.y + 0.06}
              width={0.88}
              height={0.88}
              rx={0.08}
              className={t.covered ? 'enemy-range-tile covered' : 'enemy-range-tile'}
            />
          ))}
          {/* vector-effect keeps the outline one pixel however far the grid is scaled */}
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            className="enemy-range-circle"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* The icon sits over the centre tile rather than inside the svg: an <image>
            href needs its own encoding for the apostrophes and non-ASCII letters in
            these filenames, and next/image already knows how to serve them. */}
        <span className="enemy-range-icon" style={{ width: `${100 / side}%`, height: `${100 / side}%` }}>
          {icon ? (
            <Image src={icon} alt={name} width={72} height={72} unoptimized />
          ) : (
            <span className="fallback">{name[0]}</span>
          )}
        </span>
      </div>
    </div>
  );
}
