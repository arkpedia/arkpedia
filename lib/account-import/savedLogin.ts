/**
 * The Yostar login an import signed in with, kept in this browser so the next import needs
 * no emailed code: the Yostar uid and access token, and the device id they were issued to
 * (the game token exchange expects the same one). The maintainer's decision, 2026-10-01, as
 * Krooster's "Remember login" does, except that it never leaves the browser for anything
 * but Yostar's and the game's own servers, through the relay that cannot read it.
 *
 * Only this browser has it, in localStorage. "Forget this login" removes it, and a login
 * the game no longer accepts is removed the first time it fails.
 */
import { SERVERS, type ServerId } from './yostar';

export const SAVED_LOGIN_KEY = 'arkpediaGameLogin';

export interface SavedLogin {
  server: ServerId;
  uid: string;
  token: string;
  deviceId: string;
  /** The email, masked ("d•••@gmail.com"), to say whose login it is. */
  label: string;
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** A stored login, or null for anything that is not one. */
export function parseSavedLogin(raw: string | null): SavedLogin | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !(String(value.server) in SERVERS)) return null;
  if (!text(value.uid, 64) || !text(value.token, 4096) || !text(value.deviceId, 128) || !text(value.label, 320)) return null;
  return { server: value.server as ServerId, uid: value.uid as string, token: value.token as string, deviceId: value.deviceId as string, label: value.label as string };
}

/** "doctor@gmail.com" -> "d•••@gmail.com". */
export function maskEmail(email: string): string {
  const [name, domain] = email.trim().split('@');
  return domain ? `${name.slice(0, 1)}•••@${domain}` : '•••';
}

export function readSavedLogin(): SavedLogin | null {
  try {
    return parseSavedLogin(window.localStorage?.getItem(SAVED_LOGIN_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveLogin(login: SavedLogin): void {
  try {
    window.localStorage?.setItem(SAVED_LOGIN_KEY, JSON.stringify(login));
  } catch {
    /* Private mode: the next import asks for a code again, as before. */
  }
}

export function forgetLogin(): void {
  try {
    window.localStorage?.removeItem(SAVED_LOGIN_KEY);
  } catch {
    /* Nothing was kept. */
  }
}
