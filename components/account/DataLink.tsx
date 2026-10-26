import { useAccountActions } from './AccountActions';

/*
 * The shared account import/export dialog opens over its caller, preserving its view and scroll.
 */
export default function DataLink() {
  const actions = useAccountActions();
  return (
    <button type="button" className="ghost btn-sm data-link" aria-haspopup="dialog" onClick={() => actions.open('import')}>Import / export</button>
  );
}
