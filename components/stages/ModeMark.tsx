/**
 * One of the game's mode emblems, drawn in the current ink.
 *
 * These arrive as one flat colour on alpha (see scripts/imports/import-mode-marks.py), so they
 * are painted as MASKS rather than placed as pictures: the shape comes from the file
 * and the colour from whatever the surrounding text is using, which is how the COST
 * glyph and the storyline emblems already work. A picture would be locked to the white
 * it was traced in, and would need a second copy for the day this theme has a light
 * mode.
 *
 * `name` is the file in public/mode-marks/, extension and all -- the set is a mix of
 * svg and webp depending on whether the source was line art or a capture, and hiding
 * that behind a guess would only mean a silent blank when the guess is wrong.
 */
export default function ModeMark({ name, className }: { name: string; className?: string }) {
  const url = `url(/mode-marks/${name})`;
  return (
    <span
      className={`mode-mark${className ? ` ${className}` : ''}`}
      style={{ maskImage: url, WebkitMaskImage: url }}
      aria-hidden="true"
    />
  );
}
