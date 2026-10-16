import { createElement, type ReactElement } from 'react';
import { ContentTablesContext } from '../../lib/content/context';

/** Component-only fixtures still render inside the page's regional release context. */
export const regionalFixture = (element: ReactElement) => createElement(ContentTablesContext.Provider,
  { value: { 'regional-schedules': { version: 1, servers: {} } } }, element);
