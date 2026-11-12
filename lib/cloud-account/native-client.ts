interface NativeAuth {
  prepare(): Promise<{ challenge: string }>;
  open(options: { state: string }): Promise<{ returnPath: string }>;
  cancel(): Promise<void>;
}
export function nativeAccountAuth(): NativeAuth | null {
  if (typeof window === 'undefined' || window.location.origin !== 'https://www.arkpedia.net') return null;
  return (window as unknown as { Capacitor?: { Plugins?: { ArkpediaAuth?: NativeAuth } } }).Capacitor?.Plugins?.ArkpediaAuth ?? null;
}
export async function nativeSignIn(plugin: NativeAuth, provider: 'google' | 'discord', mode: 'sign-in' | 'link' | 'delete' | 'confirm', returnPath: string) {
  const { challenge } = await plugin.prepare();
  try {
    const response = await fetch('/api/native-auth/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, provider, mode, returnPath }) });
    const result = await response.json().catch(() => ({})) as { state?: string; code?: string };
    if (result.code === 'SESSION_NOT_FRESH') throw new Error('SESSION_NOT_FRESH');
    if (!response.ok || !result.state) throw new Error('Sign-in could not start. Please try again.');
    const completed = await plugin.open({ state: result.state });
    if (!completed.returnPath.startsWith('/') || completed.returnPath.startsWith('//') || /[\\\u0000-\u001f]/.test(completed.returnPath)) throw new Error('Invalid sign-in return.');
    return completed.returnPath;
  } catch (error) {
    await plugin.cancel().catch(() => {});
    throw error;
  }
}
