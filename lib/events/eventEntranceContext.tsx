import { createContext, useContext } from 'react';

export const EventEntranceContext = createContext(false);
/** Background engines may prepare/cue a track, but cannot start over an entrance. */
export function useEventEntranceAudioHold(): boolean {
  return useContext(EventEntranceContext);
}
