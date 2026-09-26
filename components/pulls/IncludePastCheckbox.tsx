/** Whether past (unclaimed) rewards count toward the forecast: one saved setting,
 *  placed beside the Past events tab on desktop and beside the panel heading on
 *  phones. A real checkbox in the .check primitive: #64 had turned it into a .tgl
 *  button, and the maintainer asked for the checkboxes back (2026-09-26). */
export function IncludePastCheckbox({ checked, onChange, className = '' }: {
  checked: boolean; onChange: (value: boolean) => void; className?: string;
}) {
  return <label className={`check pulls-include-past${className ? ` ${className}` : ''}`}
    title={checked ? 'Past rewards included in forecast' : 'Include past rewards in forecast'}>
    <input type="checkbox" aria-label="Include past rewards in forecast" checked={checked} onChange={event => onChange(event.target.checked)} />
    Include
  </label>;
}
