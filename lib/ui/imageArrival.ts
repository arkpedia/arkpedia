/**
 * Images fade in as they arrive (r11 quiet polish, docs/development/ui-primitives.md
 * rule 23). CSS cannot see when an <img> finishes loading, so this tells it, with two
 * attributes styles/core/motion.css reads (under prefers-reduced-motion: no-preference
 * only):
 *   - `data-image-arrivals` on <html> while this runs: an image without `data-shown` is
 *     held at opacity 0, since it has not arrived;
 *   - `data-shown` on an image once it may be seen, and `data-arrived` with it when it
 *     arrived in time to fade (`img-arrive`, an opacity fade from 0 with no fill). The
 *     `data-arrived` mark comes off when the fade ends, so a panel shown again does not
 *     fade its images twice; `data-shown` stays, so a new src on an image already shown
 *     (a banner picked, a wider srcset candidate) is never held or faded: the old picture
 *     stays up until the new one is in.
 *
 * Only an image that has drawn nothing is held, so holding it changes nothing on screen.
 * Every image already in when it enters the page (the server's, found when this starts
 * once the app has hydrated, or one put in later whose picture the browser already has),
 * or already drawing (its size is known, so its first rows can be on screen), or broken,
 * is shown as it is: it never fades. A copy of a picture already on screen came in at
 * once, and fading it from nothing blinked it: the operator artwork's cross-fade puts the
 * outgoing picture in again inside the box that fades it out, and it dropped to nothing
 * at the switch. Only an image that loads after it is put in fades.
 *
 * It fails open. An image that errors is shown at once. One that has not arrived
 * HOLD_MS after it came on screen is shown as it is and not faded later: a slow line
 * draws an image row by row as its bytes come in, and holding that for the whole load
 * would hide it, and fading it at the end would blank the half-drawn picture (measured
 * at 40 KB/s: 65 KB of a banner drawn, then a blank frame at its load). An image in a
 * box that is not shown is not timed until it is, and one that arrives there is shown,
 * unfaded, since it is not drawn. A page whose scripts never ran, or a
 * reader who asked for reduced motion, gets no attribute at all, so nothing is held.
 *
 * One MutationObserver (added images, and removed ones to stop timing them), one
 * IntersectionObserver (when a held image comes on screen), and passive capture listeners
 * on the document (`load` and `error` do not bubble). Nothing is scroll-linked. Called
 * from pages/_app.tsx; returns its own teardown.
 */
export const WATCHING = 'data-image-arrivals';
export const SHOWN = 'data-shown';
export const ARRIVED = 'data-arrived';
/** The keyframes motion.css plays on `data-arrived`. */
export const ARRIVE_ANIMATION = 'img-arrive';
/** How long a held image may take, once on screen, before it is shown as it is (ms). */
export const HOLD_MS = 1500;

type ImageState = Pick<HTMLImageElement, 'complete' | 'naturalWidth'>;
/** What to do with an image as it enters the page (or is found there when the watch
 *  starts): `shown` as it is, or `held` until it loads, and fades in then. */
export function arrivalOf(img: ImageState): 'shown' | 'held' {
  // In already (a picture the browser has), or broken or with no address (complete, with
  // nothing to draw): nothing to wait for.
  if (img.complete) return 'shown';
  // Its size is known, so its bytes are coming in, and its first rows may be on screen.
  if (img.naturalWidth > 0) return 'shown';
  return 'held';
}

export function watchImageArrivals(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const root = doc.documentElement;
  const timers = new Map<HTMLImageElement, number>();
  const show = (img: HTMLImageElement, fade: boolean) => {
    if (img.hasAttribute(SHOWN)) return;
    img.setAttribute(SHOWN, '');
    // Not drawn (in a closed panel, a hidden tab): nothing to fade, and a fade marked now
    // would wait unplayed for the panel to open. Shown as it is.
    if (fade && img.getClientRects().length) img.setAttribute(ARRIVED, '');
    const timer = timers.get(img);
    if (timer !== undefined) { view.clearTimeout(timer); timers.delete(img); }
    seen?.unobserve(img);
  };
  // A held image is timed from when it is first on screen, not from when it was put in:
  // a lazy one far down the page is not even asked for until the reader nears it.
  const seen = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target as HTMLImageElement;
      seen!.unobserve(img);
      if (!img.hasAttribute(SHOWN) && !timers.has(img)) timers.set(img, view.setTimeout(() => { timers.delete(img); show(img, false); }, HOLD_MS));
    }
  }) : null;
  const adopt = (img: HTMLImageElement) => {
    if (img.hasAttribute(SHOWN)) return;
    if (arrivalOf(img) === 'shown') { show(img, false); return; }
    // Held until it loads, or until HOLD_MS after it is on screen; with no way to time
    // it, never held.
    if (seen) seen.observe(img); else show(img, false);
  };
  const imagesIn = (node: Node): HTMLImageElement[] => (node instanceof view.HTMLImageElement
    ? [node]
    : node instanceof view.Element ? Array.from(node.getElementsByTagName('img')) : []);
  const added = new view.MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => { for (const img of imagesIn(node)) adopt(img); });
      record.removedNodes.forEach((node) => {
        for (const img of imagesIn(node)) {
          if (img.isConnected) continue;
          seen?.unobserve(img);
          const timer = timers.get(img);
          if (timer !== undefined) { view.clearTimeout(timer); timers.delete(img); }
        }
      });
    }
  });
  const onLoad = (event: Event) => { if (event.target instanceof view.HTMLImageElement) show(event.target, true); };
  const onError = (event: Event) => { if (event.target instanceof view.HTMLImageElement) show(event.target, false); };
  const onEnd = (event: Event) => {
    if (event.target instanceof view.HTMLImageElement && (event as AnimationEvent).animationName === ARRIVE_ANIMATION) event.target.removeAttribute(ARRIVED);
  };
  const options: AddEventListenerOptions = { capture: true, passive: true };
  // All in one task, before the next paint: what is there is sorted, then the hold turns
  // on, so nothing already drawn is hidden for a frame.
  for (const img of Array.from(doc.images)) adopt(img);
  root.setAttribute(WATCHING, '');
  added.observe(root, { childList: true, subtree: true });
  doc.addEventListener('load', onLoad, options);
  doc.addEventListener('error', onError, options);
  doc.addEventListener('animationend', onEnd, options);
  doc.addEventListener('animationcancel', onEnd, options);
  return () => {
    root.removeAttribute(WATCHING);
    added.disconnect();
    seen?.disconnect();
    timers.forEach((timer) => view.clearTimeout(timer));
    timers.clear();
    doc.removeEventListener('load', onLoad, options);
    doc.removeEventListener('error', onError, options);
    doc.removeEventListener('animationend', onEnd, options);
    doc.removeEventListener('animationcancel', onEnd, options);
  };
}
