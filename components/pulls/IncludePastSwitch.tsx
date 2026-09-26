/** Whether past (unclaimed) rewards count toward the forecast: one saved setting,
 *  placed beside the Past events tab on desktop and beside the panel heading on
 *  phones. A .tgl with aria-pressed -- it was a native checkbox restyled into a
 *  hand-drawn switch. */
export function IncludePastSwitch({ checked, onChange, className = '' }: {
  checked: boolean; onChange: (value: boolean) => void; className?: string;
}) {
  return <button type="button" className={`tgl pulls-include-switch${checked ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
    aria-pressed={checked} aria-label="Include past rewards in forecast"
    title={checked ? 'Past rewards included in forecast' : 'Include past rewards in forecast'}
    onClick={() => onChange(!checked)}>
    Include
  </button>;
}
