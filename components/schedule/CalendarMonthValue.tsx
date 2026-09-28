import type { ReactNode } from 'react';
import type { SelectOption } from '@/components/ui/StyledSelect';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A closed menu's text that holds one width whatever is picked: every value it can show
 * sits in the same grid cell, hidden, under the one shown, so the trigger is as wide as
 * the widest of them in whatever face is drawing (Rajdhani, or the fallback before it
 * arrives). The /schedule calendar's arrows and Today sit after the month and the year,
 * and a trigger as wide as its own value moved them at every step (MAY 85px, SEPTEMBER
 * 153px at 1440; a px min-width lost to the StyledSelect root's min-width: 0).
 * row-alignment.spec.ts steps through every month and fails a control that moves.
 */
function Steady({ shown, all, className, hidden }: { shown: string; all: string[]; className?: string; hidden?: boolean }): ReactNode {
  return (
    <span className={`cal-steady ${className ?? ''}`} aria-hidden={hidden || undefined}>
      {all.map((value) => <span key={value} className="cal-steady-sizer" aria-hidden="true">{value}</span>)}
      <span>{shown}</span>
    </span>
  );
}

/**
 * The closed month menu's text, for a title-size StyledSelect (the /schedule calendar's
 * month, and its specimen on /dev/ui): the full name, and on a phone its first three
 * letters in its place. The calendar's head gives the month what is left of the line
 * after the two month steps and the year, and at 390px that is 105px, against the 109px
 * SEPTEMBER needs in Rajdhani (75 of them at 360). The full name stays in the trigger
 * for a screen reader, visually hidden; the short one is aria-hidden. The swap is CSS
 * (styles/schedule/timeline.css, 440px and under), so the server render and hydration
 * agree at every width. Both hold the width of the widest month (Steady, above).
 */
export function renderMonthValue(option: SelectOption) {
  return (
    <>
      <Steady className="cal-month-full" shown={option.label} all={MONTHS} />
      <Steady className="cal-month-short" shown={option.label.slice(0, 3)} all={MONTHS.map((m) => m.slice(0, 3))} hidden />
    </>
  );
}

/** The closed year menu's text at the width of the widest year it offers (the digits of
 *  Rajdhani are not all one width: 2026 and 2027 differ by 2px). */
export function steadyValue(all: string[]) {
  return function renderSteadyValue(option: SelectOption) {
    return <Steady shown={option.label} all={all} />;
  };
}
