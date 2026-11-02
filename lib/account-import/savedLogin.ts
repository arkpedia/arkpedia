/**
 * A remembered sign-in, saved locally after a successful import only when the reader checks
 * "Save this sign-in on this browser" in components/account-import/GameSignIn. The next import needs no
 * emailed code: the Yostar uid, its access token and the code's own token (the Account Center signs
 * in with it, for the pull history), the email it was issued to, and the device id the game's token
 * exchange expects again. Opt-out from 2026-10-17; opt-in again from 2026-10-20, after readers raised
 * the security of a token kept by default.
 *
 * It lives in localStorage and goes nowhere but Yostar's and the game's own servers, through the
 * relay, which carries the encrypted bytes and cannot read them. No Arkpedia server ever receives
 * it, and a backup file leaves it out (lib/account/backup.ts lists what it keeps). "Forget everything"
 * clears it along with all other site data. Failed imports never remove it; a successful
 * explicitly requested replacement or the Forget action can replace/remove it.
 */
import { isServerId, type ServerId, type YostarAccount } from './yostar';

export const SAVED_LOGIN_KEY = 'arkpediaYostarLogin';

export interface SavedLogin extends YostarAccount {
  server: ServerId;
  email: string;
  deviceId: string;
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** A stored sign-in, or null for anything that is not one. */
export function parseSavedLogin(raw: string | null): SavedLogin | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !isServerId(value.server)) return null;
  if (!text(value.uid, 64) || !text(value.token, 4096) || !text(value.authToken, 4096) || !text(value.deviceId, 128) || !text(value.email, 320) || !/^\S+@\S+\.\S+$/.test(value.email as string)) return null;
  return { server: value.server as ServerId, email: value.email as string, uid: value.uid as string, token: value.token as string, authToken: value.authToken as string, deviceId: value.deviceId as string };
}

/** "doctor@gmail.com" -> "d•••@gmail.com": whose sign-in it is, without spelling it out. */
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
    /* Private mode: the next import asks for a code, as it does without one. */
  }
}

export function forgetLogin(): void {
  try {
    window.localStorage?.removeItem(SAVED_LOGIN_KEY);
  } catch {
    /* Nothing kept. */
  }
}
