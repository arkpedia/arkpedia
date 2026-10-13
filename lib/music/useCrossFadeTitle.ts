import { songTitle } from './musicPolish';

/** Existing consumer API; a song now keeps its title across views and mount times. */
export function useCrossFadeTitle(title: string, altTitle?: string | null) {
  return { displayName: songTitle(title, altTitle), fading: false };
}
