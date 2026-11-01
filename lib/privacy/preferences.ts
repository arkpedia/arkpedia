import { useSyncExternalStore } from 'react';
export const PRIVACY_KEY = 'arkpedia:privacy:v1';
const EVENT = 'arkpedia:privacy-changed';
const VALID_FOR = 180 * 24 * 60 * 60 * 1000;
export type PrivacyChoices = { analytics: boolean; externalMedia: boolean };
export function parsePrivacy(raw: string | null, now = Date.now()): PrivacyChoices {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version === 1 && Number.isFinite(value.savedAt) && value.savedAt <= now && now - value.savedAt < VALID_FOR)
      return { analytics: value.analytics === true, externalMedia: value.externalMedia === true };
  } catch { /* Missing or invalid choices never enable optional services. */ }
  return { analytics: false, externalMedia: false };
}
export function readPrivacy(): PrivacyChoices {
  try { return parsePrivacy(localStorage.getItem(PRIVACY_KEY)); } catch { return parsePrivacy(null); }
}
export function readAnalyticsDecision(): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(PRIVACY_KEY) ?? 'null');
    return value?.version === 1 && Number.isFinite(value.savedAt) && value.savedAt <= Date.now() && Date.now() - value.savedAt < VALID_FOR && value.analyticsChosen !== false;
  } catch { return false; }
}
export function useAnalyticsDecision(): boolean {
  return useSyncExternalStore(subscribe, readAnalyticsDecision, () => true);
}
let mediaDismissed = false;
export function readMediaDecision(): boolean {
  if (mediaDismissed) return true;
  try {
    const value = JSON.parse(localStorage.getItem(PRIVACY_KEY) ?? 'null');
    return value?.version === 1 && Number.isFinite(value.savedAt) && value.savedAt <= Date.now() && Date.now() - value.savedAt < VALID_FOR
      && (value.externalMediaChosen === true || value.externalMedia === true);
  } catch { return false; }
}
export function useMediaDecision(): boolean { return useSyncExternalStore(subscribe, readMediaDecision, () => true); }
export function dismissMediaPrompt(): void { mediaDismissed = true; window.dispatchEvent(new Event(EVENT)); }
export function savePrivacy(choices: PrivacyChoices, analyticsChosen = true, externalMediaChosen = choices.externalMedia || readMediaDecision()): void {
  localStorage.setItem(PRIVACY_KEY, JSON.stringify({ version: 1, ...choices, analyticsChosen, externalMediaChosen, savedAt: Date.now() }));
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify); window.addEventListener('storage', notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify); };
}
export function usePrivacyChoice(key: keyof PrivacyChoices): boolean {
  return useSyncExternalStore(subscribe, () => readPrivacy()[key], () => false);
}
export const MEDIA_REQUEST = 'arkpedia:request-external-media';
export type MediaRequest = { allow: () => void; cancel?: () => void };
export function requestExternalMedia(allow: () => void, cancel?: () => void): void {
  if (readPrivacy().externalMedia) allow();
  else window.dispatchEvent(new CustomEvent<MediaRequest>(MEDIA_REQUEST, { detail: { allow, cancel } }));
}

/** A withdrawal also retires services already running in other open tabs. */
export function watchPrivacyWithdrawal(): () => void {
  let previous = readPrivacy();
  const changed = () => {
    const next = readPrivacy();
    if ((previous.analytics && !next.analytics) || (previous.externalMedia && !next.externalMedia)) window.location.reload();
    previous = next;
  };
  window.addEventListener('storage', changed); window.addEventListener(EVENT, changed);
  return () => { window.removeEventListener('storage', changed); window.removeEventListener(EVENT, changed); };
}
