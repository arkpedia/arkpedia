/** Keep OAuth returns on this site, with only the account overlay state replaced. */
export function accountReturnPath(path: string, failed = false): string {
  const origin = 'https://arkpedia.invalid';
  let url: URL;
  try {
    url = new URL(path, origin);
    if (!path.startsWith('/') || path.startsWith('//') || url.origin !== origin || /[\\\u0000-\u001f]/.test(path)) throw Error('Invalid return path');
  } catch { url = new URL('/account', origin); }
  for (const key of ['account', 'settings', 'confirm', 'signin']) url.searchParams.delete(key);
  url.searchParams.set('account', 'welcome');
  if (failed) url.searchParams.set('signin', 'failed');
  return url.pathname + url.search + url.hash;
}
