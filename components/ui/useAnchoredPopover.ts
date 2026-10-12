import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Place the menu beside its trigger, including inside scrolled operator panels. */
export function useAnchoredPopover(width: number) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 520, width });
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events, close]);
  useClientLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      const menu = menuRef.current;
      if (!button || !menu) return;
      const r = button.getBoundingClientRect();
      const gap = 12;
      const bounds = button.closest('main')?.getBoundingClientRect();
      const minLeft = Math.max(gap, (bounds?.left ?? 0) + gap);
      const maxRight = Math.min(window.innerWidth - gap, (bounds?.right ?? window.innerWidth) - gap);
      const menuWidth = Math.min(width, maxRight - minLeft);
      if (r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
      const below = window.innerHeight - r.bottom - gap - 6;
      const above = r.top - gap - 6;
      const desired = Math.min(menu.scrollHeight + menu.offsetHeight - menu.clientHeight, 520);
      const useBelow = below >= desired || below >= above;
      const maxHeight = Math.max(80, Math.min(520, useBelow ? below : above));
      const height = Math.min(desired, maxHeight);
      setPosition({
        left: Math.max(minLeft, Math.min(r.left, maxRight - menuWidth)),
        width: menuWidth,
        top: useBelow ? r.bottom + 6 : Math.max(gap, r.top - height - 6),
        maxHeight,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (menuRef.current) observer.observe(menuRef.current);
    const outside = (e: PointerEvent) => {
      if (!buttonRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, width, close]);
  return { open, setOpen, close, buttonRef, menuRef, menuStyle: position };
}
