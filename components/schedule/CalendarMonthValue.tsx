import type { SelectOption } from '@/components/ui/StyledSelect';

/**
 * The closed month menu's text, for a title-size StyledSelect (the /schedule calendar's
 * month, and its specimen on /dev/ui): the full name, and on a phone its first three
 * letters in its place. The calendar's head gives the month what is left of the line
 * after the two month steps and the year, and at 390px that is 105px, against the 109px
 * SEPTEMBER needs in Rajdhani (75 of them at 360). The full name stays in the trigger
 * for a screen reader, visually hidden; the short one is aria-hidden. The swap is CSS
 * (styles/schedule/timeline.css, 440px and under), so the server render and hydration
 * agree at every width. tests/browser/row-alignment.spec.ts selects every month at 360,
 * 390 and 460 and fails a value its trigger cuts short.
 */
export function renderMonthValue(option: SelectOption) {
  return (
    <>
      <span className="cal-month-full">{option.label}</span>
      <span className="cal-month-short" aria-hidden="true">{option.label.slice(0, 3)}</span>
    </>
  );
}
