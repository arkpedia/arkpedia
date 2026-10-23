import { forwardRef, type ButtonHTMLAttributes } from 'react';

/**
 * The × that closes or removes something: a dialog, a drawer, a popover, a plan row, a
 * banner goal, a queued track, a search field's text (ui-primitives rule 21).
 *
 * It has no border and no box at rest, so it reads as the glyph alone, and the whole
 * square around the glyph is the hit area: a press a few pixels off the × still lands
 * (the maintainer, 2026-09-27, on /pull-planner's goal rows: "so it just looks like an x but its
 * clickable even when not perfectly on the x symbol"). Hover fills that square faintly,
 * which shows how far the target reaches; keyboard focus draws the site ring.
 *
 * `label` is required and becomes the accessible name: a glyph says nothing to a screen
 * reader, and "Close" is not enough where two things on the screen close.
 *
 * `dense` is for a spot a control-height square would crowd -- inside a field, a slot
 * row, a tile's plate -- and is still a square of 24px or more (WCAG 2.5.8).
 * `className` places the button (position, margins); it never repaints it.
 */
export interface XButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'type'> {
  label: string;
  dense?: boolean;
}

const XButton = forwardRef<HTMLButtonElement, XButtonProps>(function XButton({ label, dense = false, className, ...rest }, ref) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={label}
      className={['btn-x', dense ? 'btn-x-dense' : '', className ?? ''].filter(Boolean).join(' ')}
    >
      <XGlyph />
    </button>
  );
});

export default XButton;

/** The drawn ×, in the ink of whatever holds it. A path, not a text glyph: a "×"
 *  sits on a different line in Rajdhani, Inter and CI's fallback face, and this is
 *  centred the same on every one. For a × that cannot be a button of its own (a
 *  removable tab's, `.tab-remove`). */
export function XGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}
