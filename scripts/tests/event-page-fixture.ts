import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import { MusicPlayerProvider } from '../../lib/music/musicPlayerContext';
import { createElement, type ReactElement } from 'react';
import { ContentTablesContext } from '../../lib/content/context';

/** Event pages also render the inert page-audio owner inside the app's player context. */
export const eventPageFixture = (element: ReactElement) => createElement(RouterContext.Provider,
  { value: { pathname: '/events/[slug]' } as NextRouter },
  createElement(ContentTablesContext.Provider, { value: { 'regional-schedules': { version: 1, servers: {} }, 'page-music': [] } },
    createElement(MusicPlayerProvider, { children: element })));
