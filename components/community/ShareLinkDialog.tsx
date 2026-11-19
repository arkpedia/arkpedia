import { useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { LONG_LINK_CHARS, MAX_SHARE_CHARS } from '@/lib/tier-list/share';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import styles from './TierList.module.css';

export interface ShareLinkMode { id: string; title: string; body: string; needsItems: boolean }

/**
 * The links a maker's work can be shared as (lib/tier-list/share.ts, chartShare.ts), each
 * copied from here. Where the browser has no clipboard (a page not served over https, a
 * refused permission) the link is shown to copy by hand.
 */
export default function ShareLinkDialog({ title, param, note, modes, hasItems, encode, onClose }: { title: string; param: string; note: string; modes: readonly ShareLinkMode[]; hasItems: boolean; encode: (mode: string) => Promise<string>; onClose: () => void }) {
  const [message, setMessage] = useState(note);
  const [manual, setManual] = useState('');

  async function copy(mode: ShareLinkMode) {
    setManual('');
    let address: string;
    try {
      const payload = await encode(mode.id);
      // The same limit the reader's side applies: never hand out a link that will not open.
      if (payload.length > MAX_SHARE_CHARS) { setMessage(T.linkTooLong); return; }
      address = `${window.location.origin}${window.location.pathname}#${param}=${payload}`;
    } catch { setMessage(T.linkFailed); return; }
    try {
      await navigator.clipboard.writeText(address);
      setMessage(`${mode.title}: ${address.length > LONG_LINK_CHARS ? T.linkCopiedLong : T.linkCopied}`);
    } catch {
      setManual(address);
      setMessage(T.linkManual);
    }
  }

  return (
    <ImportDialog title={title} onClose={onClose} className={styles.dialog}>
      <ul className={styles.shareModes}>
        {modes.map((mode) => {
          const blocked = mode.needsItems && !hasItems;
          return (
            <li key={mode.id} className={styles.shareMode} data-share-mode={mode.id}>
              <div>
                <h3 className="entity-title entity-title-xs">{mode.title}</h3>
                <p>{mode.body}</p>
              </div>
              <button type="button" className="ghost" disabled={blocked} title={blocked ? T.linkEmpty : undefined} aria-label={`${T.copyLink}: ${mode.title}`} onClick={() => void copy(mode)}>{T.copyLink}</button>
            </li>
          );
        })}
      </ul>
      <p className={`hint ${styles.shareStatus}`} role="status">{message}</p>
      {manual && <input type="text" readOnly className={styles.shareLink} aria-label={T.linkManualLabel} value={manual} onFocus={(event) => event.target.select()} />}
    </ImportDialog>
  );
}
