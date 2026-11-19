/** Whether past (unclaimed) rewards count toward the forecast: one saved setting, drawn
 *  inside the Past events frame beside the disclosure it belongs to, at every width
 *  (pages/pull-planner.tsx; a second copy beside the panel heading for phones went, since the
 *  frame shows on a phone too). A real checkbox in the .check primitive: #64 had turned
 *  it into a .tgl button, and the maintainer asked for the checkboxes back (2026-09-26). */
export function IncludePastCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="check pulls-include-past"
    title={checked ? 'Past rewards included in forecast' : 'Include past rewards in forecast'}>
    <input type="checkbox" aria-label="Include past rewards in forecast" checked={checked} onChange={event => onChange(event.target.checked)} />
    Include
  </label>;
}

/** Whether the Skin wishlist's OP is held back from the forecast and the banner budgets: the same
 *  "Include" setting, drawn the same way inside the Skin wishlist frame (pages/pull-planner.tsx). */
export function IncludeSkinsCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="check pulls-include-past"
    title={checked ? 'Skin wishlist OP held back from your pulls' : 'Include the skin wishlist (hold its OP back from your pulls)'}>
    <input type="checkbox" aria-label="Include skin wishlist" checked={checked} onChange={event => onChange(event.target.checked)} />
    Include
  </label>;
}
