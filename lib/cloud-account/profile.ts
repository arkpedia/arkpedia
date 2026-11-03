import { isServerId, type ServerId } from '@/lib/account-import/yostar';

export interface AccountProfile { username: string; friendTag: string | null; friendServer: ServerId | null; avatarId?: string | null }
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'support', 'arkpedia', 'system']);

export function normalizeUsername(value: unknown): { username: string; key: string } {
  if (typeof value !== 'string') throw new Error('Enter a username.');
  const username = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if ([...username].length < 3 || [...username].length > 40) throw new Error('Use 3–40 characters.');
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*(?:#[0-9]{1,8})?$/u.test(username)) {
    throw new Error('Use letters, numbers, spaces, dots, underscores or hyphens. A #number can go at the end.');
  }
  const key = username.toLowerCase();
  if (RESERVED.has(key.split('#')[0])) throw new Error('That username is reserved. Choose another.');
  return { username, key };
}

export function validateProfile(input: Record<string, unknown>): AccountProfile & { key: string } {
  const { username, key } = normalizeUsername(input.username);
  const friendTag = typeof input.friendTag === 'string' ? input.friendTag.normalize('NFKC').trim() : '';
  if (!friendTag) {
    if (input.friendServer) throw new Error('Enter your Arknights name and #number, or leave both friend fields empty.');
    return { username, key, friendTag: null, friendServer: null };
  }
  if ([...friendTag].length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*#[0-9]{1,8}$/u.test(friendTag)) {
    throw new Error('Enter an Arknights name and #number, such as Doctor#1234.');
  }
  if (!isServerId(input.friendServer)) throw new Error('Choose the server for your Arknights friend tag.');
  return { username, key, friendTag, friendServer: input.friendServer };
}
