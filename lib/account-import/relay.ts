/**
 * The transports the account import runs on (yostar.ts).
 *
 * relayTransport is libcurl.js, curl and mbedTLS compiled to WebAssembly, tunnelling TCP
 * through the Wisp relay (config/relay.json; arkpedia/arkpedia-relay). TLS runs here, in the page,
 * against the real hosts' certificates (libcurl.js carries Mozilla's CA bundle), so the
 * relay forwards ciphertext it cannot read or alter. The relay answers only this site's
 * origins and connects only to the Yostar, game and Account Center hosts the import needs.
 *
 * libcurl.js (LGPL-3.0-or-later, unmodified) is about 550 KB compressed. It is loaded
 * as its own chunk the first time an import starts, never with the page.
 */
import type { Transport } from './yostar';
import relayConfig from '@/config/relay.json';

/** Where the relay is: config/relay.json (the relay itself is arkpedia/arkpedia-relay). */
export const RELAY_URL = relayConfig.url;

interface Libcurl {
  load_wasm(): Promise<void>;
  set_websocket(url: string): void;
  /** raw_headers: every header line as sent. A Headers object folds two Set-Cookie lines into
   *  one, and a page's own fetch never shows them at all; libcurl's response keeps them. */
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response & { raw_headers?: [string, string][] }>;
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

async function read(response: Response & { raw_headers?: [string, string][] }) {
  const text = await response.text();
  const headers = response.raw_headers ?? [...response.headers.entries()];
  try {
    return { status: response.status, json: text ? JSON.parse(text) : null, headers };
  } catch {
    // Not JSON (an error page): the flow reports the status, or the missing fields.
    return { status: response.status, json: null, headers };
  }
}

declare global {
  interface Window {
    /** A browser test's stand-in for the relay (tests/browser/account-import.spec.ts), set by
     *  its init script before the page loads, so a test drives the sign-in without Yostar, the
     *  game or the relay. The site never sets it. */
    __arkpediaImportTransport?: Transport;
  }
}

export const relayTransport: Transport = async (url, { method, headers, body }) => {
  const stub = typeof window === 'undefined' ? undefined : window.__arkpediaImportTransport;
  if (stub) return stub(url, { method, headers, body });
  return read(await (await libcurl()).fetch(url, { method, headers, body }));
};

/** The page's own fetch, for a host that allows any origin. */
export const directTransport: Transport = async (url, { method, headers, body }) => read(await fetch(url, { method, headers, body }));
