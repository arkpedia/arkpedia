// The pop-up a phone or tablet shows when the reader turns Endfield music on
// (components/music/MusicGameSetting.tsx): Endfield's songs play only from YouTube, which a
// phone pauses when the screen locks or another app opens, where Arknights songs play on from
// Monster Siren's files. Not on a desktop, whose background tabs keep playing. The reader can
// tick "Don't show again", kept in this browser.

export const ENDFIELD_NOTICE_KEY = 'musicEndfieldNoticeDismissed';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The pop-up's text: the inline note's sentence, and what still plays on. */
export const ENDFIELD_NOTICE_TEXT = 'Endfield songs play from YouTube, so on phones they stop when the screen locks or you switch apps. Arknights songs keep playing in the background.';

/** Whether turning Endfield music on shows the pop-up: on a touch screen (`coarse`, the site's
 *  `(pointer: coarse)` check), unless the reader chose not to see it again. Storage that refuses
 *  to answer shows it: the reader's choice is lost, never the warning. */
export function shouldShowEndfieldNotice(storage: Storage | null | undefined, coarse: boolean): boolean {
  if (!coarse) return false;
  try {
    return storage?.getItem(ENDFIELD_NOTICE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function setEndfieldNoticeDismissed(storage: Storage | null | undefined, dismissed: boolean): void {
  try {
    if (dismissed) storage?.setItem(ENDFIELD_NOTICE_KEY, 'true');
    else storage?.removeItem(ENDFIELD_NOTICE_KEY);
  } catch { /* refused: the pop-up shows again next time */ }
}
