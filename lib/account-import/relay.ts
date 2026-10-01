/**
 * The transports the account import runs on (yostar.ts).
 *
 * relayTransport is libcurl.js, curl and mbedTLS compiled to WebAssembly, tunnelling TCP
 * through the Wisp relay at relay.arkpedia.net (infra/relay). TLS runs here, in the page,
 * against the real hosts' certificates (libcurl.js carries Mozilla's CA bundle), so the
 * relay forwards ciphertext it cannot read or alter. The relay answers only this site's
 * origins and connects only to the Yostar and game hosts the import needs.
 *
 * libcurl.js (LGPL-3.0-or-later, unmodified) is about 550 KB compressed. It is loaded
 * as its own chunk the first time an import starts, never with the page.
 */
import type { Transport } from './yostar';

export const RELAY_URL = 'wss://relay.arkpedia.net/wisp/';

interface Libcurl {
  load_wasm(): Promise<void>;
  set_websocket(url: string): void;
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response>;
}

let loading: Promise<Libcurl> | null = null;
function libcurl(): Promise<Libcurl> {
  loading ??= import('libcurl.js/bundled').then(async (module) => {
    const curl = module.libcurl as Libcurl;
    await curl.load_wasm();
    curl.set_websocket(RELAY_URL);
    return curl;
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function read(response: Response) {
  const text = await response.text();
  try {
    return { status: response.status, json: text ? JSON.parse(text) : null };
  } catch {
    // Not JSON (an error page): the flow reports the status, or the missing fields.
    return { status: response.status, json: null };
  }
}

export const relayTransport: Transport = async (url, { method, headers, body }) => read(await (await libcurl()).fetch(url, { method, headers, body }));

/** The page's own fetch, for a host that allows any origin. */
export const directTransport: Transport = async (url, { method, headers, body }) => read(await fetch(url, { method, headers, body }));
