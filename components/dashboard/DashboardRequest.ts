import { createContext, useContext } from 'react';

export const DashboardRequest = createContext<typeof fetch | null>(null);

export function useDashboardRequest() {
  return useContext(DashboardRequest) ?? fetch;
}
