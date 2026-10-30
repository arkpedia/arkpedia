import { useEffect, useState } from 'react';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { useContentUrl } from '@/lib/content/context';

// Intentionally browser-only. Adding this to CLOUD_KEYS would change the sync
// contract for held clients. Do not add it to BACKUP_STORES implicitly either.
export const PROFILE_AVATAR_KEY = 'arkpedia:profile-avatar-v1';
const EVENT = 'arkpedia:profile-avatar';
/** The icons a reader may choose, and each base-skill icon's facility: data/profile-avatars.json, served as public/profile-avatars.json,
 *  which arkpedia-data's import builds nightly from the published art (its
 *  importer/scripts/build/build-profile-avatars.mjs). */
export type AvatarCatalogue = { icons: string[]; facilities: Record<string, string> };
export const AVATAR_CATALOGUE = '/profile-avatars.json';

const pending = new Map<string, Promise<AvatarCatalogue>>();
/** The live release's catalogue (`url` from useContentUrl), cached by release. A new deployment
 *  may precede the first content release that publishes the file: then the deployed copy. */
export function avatarCatalogue(url: string): Promise<AvatarCatalogue> {
  const cached = pending.get(url);
  if (cached) return cached;
  const request = (async () => {
    let response = await fetchAsset(url);
    if (response.status === 404 && url !== AVATAR_CATALOGUE) response = await fetchAsset(AVATAR_CATALOGUE);
    if (!response.ok) throw new Error('The icon catalogue could not be loaded.');
    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.icons) || !data.icons.length || data.icons.some((id: unknown) => typeof id !== 'string')
      || !data.facilities || typeof data.facilities !== 'object' || Object.values(data.facilities).some(value => typeof value !== 'string')) {
      throw new Error('The icon catalogue is unavailable.');
    }
    return { icons: data.icons, facilities: data.facilities } as AvatarCatalogue;
  })();
  pending.set(url, request);
  request.catch(() => pending.delete(url));
  return request;
}
export async function saveProfileAvatar(id: string | null, catalogueUrl: string): Promise<void> {
  if (id !== null && !(await avatarCatalogue(catalogueUrl)).icons.includes(id)) throw new Error('Choose an icon from the catalogue.');
  if (id === null) localStorage.removeItem(PROFILE_AVATAR_KEY);
  else localStorage.setItem(PROFILE_AVATAR_KEY, id);
  window.dispatchEvent(new Event(EVENT));
}
export function useProfileAvatar(): string | null {
  const [avatar, setAvatar] = useState<string | null>(null);
  const catalogueUrl = useContentUrl()(AVATAR_CATALOGUE);
  useEffect(() => {
    let generation = 0;
    const read = async () => {
      const version = ++generation;
      let id: string | null = null;
      try { id = localStorage.getItem(PROFILE_AVATAR_KEY); } catch { /* Storage can be disabled. */ }
      // Never turn a storage value into a URL before exact catalogue validation.
      let allowed = false;
      try { allowed = !!id && id.length < 512 && (await avatarCatalogue(catalogueUrl)).icons.includes(id); } catch { /* Render the safe default if the catalogue is unavailable. */ }
      if (version === generation) setAvatar(allowed ? id : null);
    };
    void read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => { generation++; window.removeEventListener(EVENT, read); window.removeEventListener('storage', read); };
  }, [catalogueUrl]);
  return avatar;
}
