import type { ReactNode } from 'react';

export interface SegmentOption<V extends string | number> {
  value: V;
  /** Visible text. Also the accessible name unless `ariaLabel` is given. */
  label: ReactNode;
  /** Accessible name when the label is an icon or abbreviation ("6★", a class glyph). */
  ariaLabel?: string;
  /** A small count after the label: "Guard 38". */
  count?: number;
  /** An icon before the label (an <img> or <svg>, sized 18px by the chip rule). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Tooltip, for an icon-only segment. */
  title?: string;
}

interface SegmentedControlProps<V extends string | number> {
  /** The group's accessible name: "Rarity", "View", "Sort by". Required -- a row of
   *  toggles with no name is announced as a list of unrelated buttons. */
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/**
 * Pick one of N: a row of .filter-chip buttons in a labelled group, with the choice
 * stated in aria-pressed.
 *
 * This is the site's toggle group (a run of buttons where exactly one is on) with the
 * pinned chip paint: --control-border at rest, 32px tall (36 at <=720), and the picked
 * one in --teal-dim with teal text and a teal border. It deliberately does NOT use
 * `cond ? 'primary' : 'ghost'`: --teal-fill is reserved for primary actions, so a
 * chosen filter never looks like the button that runs something.
 *
 * Buttons with aria-pressed rather than a radiogroup, so each option is its own Tab
 * stop and a browser test finds it with getByRole('button', { name }). Pressing the
 * current option does nothing (a pick-one control cannot be emptied); for filters
 * that toggle independently, render .filter-chip buttons directly.
 */
export default function SegmentedControl<V extends string | number>({
  label, options, value, onChange, className,
}: SegmentedControlProps<V>) {
  return (
    <div role="group" aria-label={label} className={`seg-control${className ? ` ${className}` : ''}`}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className="filter-chip"
            aria-pressed={on}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            onClick={() => { if (!on) onChange(option.value); }}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && <span className="filter-chip-count">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
