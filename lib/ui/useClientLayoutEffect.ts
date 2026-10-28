import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser, useEffect on the server, where React warns that a layout
 *  effect does nothing. Ten components each carried this line until 2026-10-27. */
export const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
