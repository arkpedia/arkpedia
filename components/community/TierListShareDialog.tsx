import { useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { encodeTierList, LONG_LINK_CHARS, MAX_SHARE_CHARS, SHARE_PARAM, type ShareMode } from '@/lib/tier-list/share';
import type { TierListState } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import styles from './TierList.module.css';

const MODES: readonly ShareMode[] = ['full', 'template', 'quiz'];

/**
 * The three links a tier list can be shared as (lib/tier-list/share.ts): the full list, the
 * template, the quiz. Each is copied from here; where the browser has no clipboard (a page
 * not served over https, a refused permission) the link is shown to copy by hand.
 */
export default function TierListShareDialog({ state, onClose }: { state: TierListState; onClose: () => void }) {
  const [message, setMessage] = useState<string>(T.shareNote);
  const [manual, setManual] = useState('');
  const placed = state.rows.some((row) => row.items.length > 0);

  async function copy(mode: ShareMode) {
    setManual('');
    let address: string;
    try {
      const payload = await encodeTierList(state, mode);
      // The same limit the reader's side applies: never hand out a link that will not open.
      if (payload.length > MAX_SHARE_CHARS) { setMessage(T.linkTooLong); return; }
      address = `${window.location.origin}${window.location.pathname}#${SHARE_PARAM}=${payload}`;
    } catch { setMessage(T.linkFailed); return; }
    try {
      await navigator.clipboard.writeText(address);
      setMessage(`${T.shareModes[mode].title}: ${address.length > LONG_LINK_CHARS ? T.linkCopiedLong : T.linkCopied}`);
    } catch {
      setManual(address);
      setMessage(T.linkManual);
    }
  }

  return (
    <ImportDialog title={T.shareDialog} onClose={onClose} className={styles.dialog}>
      <ul className={styles.shareModes}>
        {MODES.map((mode) => {
          const needsItems = mode !== 'template' && !placed;
          return (
            <li key={mode} className={styles.shareMode} data-share-mode={mode}>
              <div>
                <h3 className="entity-title entity-title-xs">{T.shareModes[mode].title}</h3>
                <p>{T.shareModes[mode].body}</p>
              </div>
              <button type="button" className="ghost" disabled={needsItems} title={needsItems ? T.linkEmpty : undefined} aria-label={`${T.copyLink}: ${T.shareModes[mode].title}`} onClick={() => void copy(mode)}>{T.copyLink}</button>
            </li>
          );
        })}
      </ul>
      <p className={`hint ${styles.shareStatus}`} role="status">{message}</p>
      {manual && <input type="text" readOnly className={styles.shareLink} aria-label={T.linkManualLabel} value={manual} onFocus={(event) => event.target.select()} />}
    </ImportDialog>
  );
}
