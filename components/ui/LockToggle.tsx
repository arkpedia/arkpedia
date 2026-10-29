/**
 * The lock beside a section whose values an import fills in (lib/ui/useLock.ts): a padlock,
 * closed while the section is read-only, and what pressing it does, as words for every reader.
 */
export default function LockToggle({ locked, onChange, what }: { locked: boolean; onChange: (locked: boolean) => void; what: string }) {
  return (
    <button type="button" className="ghost btn-sm lock-toggle" aria-pressed={locked} onClick={() => onChange(!locked)}
      title={locked ? `${what} are locked: press to edit them` : `Lock ${what.toLowerCase()} so they are not changed by accident`}>
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="9" width="12" height="8.5" rx="1.5" />
        <path d={locked ? 'M7 9V6.5a3 3 0 0 1 6 0V9' : 'M7 9V6.5a3 3 0 0 1 5.6-1.5'} strokeLinecap="round" />
      </svg>
      {/* Both words share one cell, so the button is as wide as the longer one whichever is
          showing: pressing it must not resize the row it sits in. */}
      <span className="lock-toggle-word">
        <span aria-hidden={!locked} data-active={locked}>Locked</span>
        <span aria-hidden={locked} data-active={!locked}>Unlocked</span>
      </span>
      <span className="visually-hidden">: {what}</span>
    </button>
  );
}
