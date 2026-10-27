import { useEffect, useState } from 'react';

// Intentionally browser-only. Adding this to CLOUD_KEYS would change the sync
// contract for held clients. Do not add it to BACKUP_STORES implicitly either.
export const PROFILE_AVATAR_KEY = 'arkpedia:profile-avatar-v1';
const EVENT = 'arkpedia:profile-avatar';
let catalogue: Promise<string[]> | undefined;
export function avatarCatalogue(): Promise<string[]> {
  return catalogue ??= import('./profile-avatar-catalogue.json').then(module => module.default).catch(error => { catalogue = undefined; throw error; });
}
export async function saveProfileAvatar(id: string | null): Promise<void> {
  if (id !== null && !(await avatarCatalogue()).includes(id)) throw new Error('Choose an icon from the catalogue.');
  if (id === null) localStorage.removeItem(PROFILE_AVATAR_KEY);
  else localStorage.setItem(PROFILE_AVATAR_KEY, id);
  window.dispatchEvent(new Event(EVENT));
}
export function useProfileAvatar(): string | null {
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    let generation = 0;
    const read = async () => {
      const version = ++generation;
      let id: string | null = null;
      try { id = localStorage.getItem(PROFILE_AVATAR_KEY); } catch { /* Storage can be disabled. */ }
      // Never turn a storage value into a URL before exact catalogue validation.
      let allowed = false;
      try { allowed = !!id && id.length < 512 && (await avatarCatalogue()).includes(id); } catch { /* Render the safe default if the catalogue is unavailable. */ }
      if (version === generation) setAvatar(allowed ? id : null);
    };
    void read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => { generation++; window.removeEventListener(EVENT, read); window.removeEventListener('storage', read); };
  }, []);
  return avatar;
}
