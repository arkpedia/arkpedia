import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import { useRouter } from 'next/router';


interface PopoverController {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  /** Navigation menus may own dismissal while their page initializes query parameters. */
  closeOnRouteChange?: boolean;
}

/** Place the menu beside its trigger, including inside scrolled operator panels.
 * A separate toolbar can supply its disclosure state and trigger through controller. */
export function useAnchoredPopover(width: number, align: 'start' | 'end' = 'start', controller?: PopoverController) {
  const [internalOpen, setInternalOpen] = useState(false);
  const internalButtonRef = useRef<HTMLButtonElement>(null);
  const open = controller?.open ?? internalOpen;
  const onOpenChange = controller?.onOpenChange;
  const buttonRef = controller?.buttonRef ?? internalButtonRef;
  const controlledSetOpen = useCallback<Dispatch<SetStateAction<boolean>>>(value => { onOpenChange?.(typeof value === 'function' ? value(open) : value); }, [open, onOpenChange]);
  const setOpen = onOpenChange ? controlledSetOpen : setInternalOpen;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 520, width });
  const router = useRouter();
  const close = useCallback(() => { if (onOpenChange) onOpenChange(false); else setInternalOpen(false); }, [onOpenChange]);
  const closeOnRouteChange = controller?.closeOnRouteChange !== false;
  useEffect(() => {
    if (!closeOnRouteChange) return;
    // Debounced filters mirror their state with shallow URL updates. They must not
    // dismiss a menu the reader opened while the pending write was completing.
    const navigating = (_url: string, { shallow }: { shallow: boolean }) => { if (!shallow) close(); };
    router.events.on('routeChangeStart', navigating);
    return () => router.events.off('routeChangeStart', navigating);
  }, [router.events, close, closeOnRouteChange]);
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
      if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
      const below = window.innerHeight - r.bottom - gap - 6;
      const above = r.top - gap - 6;
      const desired = Math.min(menu.scrollHeight + menu.offsetHeight - menu.clientHeight, 520);
      const useBelow = below >= desired || below >= above;
      const maxHeight = Math.max(80, Math.min(520, useBelow ? below : above));
      const height = Math.min(desired, maxHeight);
      setPosition({
        left: Math.max(minLeft, Math.min(align === 'end' ? r.right - menuWidth : r.left, maxRight - menuWidth)),
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
  }, [open, width, align, close, buttonRef]);
  return { open, setOpen, close, buttonRef, menuRef, menuStyle: position };
}
