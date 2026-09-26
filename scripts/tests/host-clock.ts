import React, { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';

// tsx compiles the pages' JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

/**
 * Hydration compares the server's HTML (rendered on Vercel, in UTC, at the request's
 * moment) with the browser's first render (in the reader's timezone, on the reader's
 * clock). This renders an element the way either host would: with the host's timezone
 * and clock set, and effects not run -- exactly what renderToString and a first client
 * render have in common. Two renders from the same props must come out identical,
 * character for character, whatever the two host clocks say.
 */
export function renderOnHost(zone: string, hostClock: number, element: ReactElement): string {
  const RealDate = Date;
  class HostDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) super(hostClock); else super(...(args as ConstructorParameters<typeof Date>));
    }
    static now() { return hostClock; }
  }
  const previous = process.env.TZ, error = console.error;
  process.env.TZ = zone;
  globalThis.Date = HostDate as DateConstructor;
  // React warns once per render that a layout effect cannot run on the server. That is
  // the point here (effects never run in either render), so it is not noise worth a line.
  console.error = (...args: unknown[]) => { if (!String(args[0]).includes('useLayoutEffect does nothing on the server')) error(...args); };
  try {
    return renderToString(createElement(RouterContext.Provider, { value: STATIC_ROUTER },
      createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, element)));
  } finally {
    console.error = error;
    globalThis.Date = RealDate;
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
}

const noop = () => {};
/** A router as the server has it for a static page: not ready, no query yet. */
const STATIC_ROUTER = {
  route: '/', pathname: '/', query: {}, asPath: '/', basePath: '', isReady: false, isFallback: false, isPreview: false, isLocaleDomain: false,
  push: async () => true, replace: async () => true, reload: noop, back: noop, forward: noop, prefetch: async () => {}, beforePopState: noop,
  events: { on: noop, off: noop, emit: noop },
} as unknown as NextRouter;
