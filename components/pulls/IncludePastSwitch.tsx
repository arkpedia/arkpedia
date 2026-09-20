/** Shared saved setting, placed beside the tab on desktop and the heading on phones. */
export function IncludePastSwitch({ checked, onChange, className = '' }: {
  checked: boolean; onChange: (value: boolean) => void; className?: string;
}) {
  return <label className={`pulls-include-switch ${className}`} title={checked ? 'Past rewards included in forecast' : 'Include past rewards in forecast'}>
    <span className="pulls-include-caption">Include</span>
    <input type="checkbox" role="switch" aria-label="Include past rewards in forecast" checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>;
}
