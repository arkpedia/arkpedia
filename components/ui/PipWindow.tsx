import { ReactNode, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A window that stays on top of everything, for a page you keep open while playing.
 *
 * Document Picture-in-Picture, which is the only web API that gives a page a window the
 * operating system keeps above other windows. `window.open` cannot: a popup goes behind
 * the moment you click the game, which is exactly when you want to be reading it.
 *
 * Feature-detect the document API rather than a browser name. Some builds of a
 * Chromium-based browser omit it, while later builds may implement it. A failed
 * request is reported so the caller can offer its regular window/tab fallback.
 */

interface PipApi {
  requestWindow: (opts?: {
    width?: number;
    height?: number;
    /** Hides the browser's own "back to tab" control in the window's title bar. */
    disallowReturnToOpener?: boolean;
  }) => Promise<Window>;
  window: Window | null;
}
type WithPip = typeof globalThis & { documentPictureInPicture?: PipApi };

export function pipSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as WithPip).documentPictureInPicture?.requestWindow === 'function';
}

/** What isOperaBrowser reads: the user-agent string and, where the browser has them,
 *  its client-hint brands. */
export interface BrowserIdentity {
  userAgent: string;
  userAgentData?: { brands?: readonly { brand: string }[] };
}

/**
 * Opera and Opera GX: the one exception to feature detection above. Opera GX has the
 * Document Picture-in-Picture API and opens the window, but the window does not stay on
 * top of the game, which is the only reason to use it (kukki PR #73, reported from
 * Opera GX). So a caller offers Opera a regular window and says why. Takes the
 * navigator explicitly, so it is decided in an effect and never during a render.
 */
export function isOperaBrowser(browser: BrowserIdentity): boolean {
  return /(?:^|\s)OPR\//.test(browser.userAgent)
    || !!browser.userAgentData?.brands?.some(({ brand }) => /opera/i.test(brand));
}

/**
 * Styles have to be COPIED, not linked.
 *
 * The pip window is a separate document: it inherits nothing, and a relative href in a
 * cloned <link> would resolve against about:blank. Same-origin sheets are inlined from
 * their already-parsed rules, and anything cross-origin falls back to an absolute href.
 */
function copyStyles(into: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const el = into.createElement('style');
      el.textContent = css;
      into.head.appendChild(el);
    } catch {
      // Cross-origin: the rules cannot be read, so point at the file itself.
      const href = (sheet as CSSStyleSheet).href;
      if (!href) continue;
      const link = into.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      into.head.appendChild(link);
    }
  }
}

export function usePipWindow(size: { width: number; height: number }, bodyClassName = 'gm-pipbody') {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [pip, setPip] = useState<Window | null>(null);
  /**
   * Why the pop-out did not happen, when it did not.
   *
   * The feature test is not enough on its own: the API can be present and still refuse
   * -- an embedded webview has no window to give, a pip window may already be open, and
   * a call that did not come from a real click is rejected. Any of those throw, and an
   * unhandled rejection would leave a button that silently does nothing.
   */
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const close = useCallback(() => { pip?.close(); }, [pip]);

  const open = useCallback(async () => {
    const api = (globalThis as WithPip).documentPictureInPicture;
    if (typeof api?.requestWindow !== 'function') {
      setError('Always-on-top is unavailable in this browser.');
      return;
    }
    setError(null);
    let w: Window;
    try {
      /* No back-to-tab control. It is the one part of the title bar a page can ask
         about, and the bar is otherwise the browser's own -- so this is as close to
         plain as the window gets. The close button stays either way, and the opener
         tab still owns the document: closing that tab still takes this with it. */
      w = await api.requestWindow({ ...size, disallowReturnToOpener: true });
    } catch (e) {
      setError(`Could not open the pop-out: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    copyStyles(w.document);
    // The theme lives on <html>, so the pip document has to be told which one it is or
    // it renders the light palette inside a dark app.
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) w.document.documentElement.setAttribute('data-theme', theme);
    w.document.body.className = bodyClassName;
    const mount = w.document.createElement('div');
    w.document.body.appendChild(mount);
    setPip(w);
    setHost(mount);
    w.addEventListener('pagehide', () => { setHost(null); setPip(null); });
  }, [size, bodyClassName]);

  /* Closing the tab has to take the pip window with it, or it is left orphaned on top
     of everything with no way back to the page that opened it. */
  useEffect(() => {
    if (!pip) return undefined;
    const bye = () => pip.close();
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [pip]);

  /* The window itself comes back too. The browser draws its title bar and nothing can
     be added to it, but the window is script-resizable, which is enough for a caller
     that wants to shrink it to a strip and grow it again. */
  return { host, win: pip, open, close, isOpen: !!host, error, clearError };
}

/** Puts children in the pip window when there is one, and in place when there is not. */
export default function PipWindow({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  if (!host) return <>{children}</>;
  return createPortal(children, host);
}
