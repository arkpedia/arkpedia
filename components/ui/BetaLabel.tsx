/** Shared understated beta label used by the site brand and account setup. */
export default function BetaLabel({ className = '' }: { className?: string }) {
  return <span className={`beta-label${className ? ` ${className}` : ''}`}>Beta</span>;
}
