export declare const ASSET_RETRY_ATTEMPTS: number;
export declare const NEXT_ASSET_URL_SOURCE: string;
export declare function nextAssetUrl(url: string): string | null;
export declare function alternateAssetUrl(url: string, attempt: number): string | null;
export interface FetchAssetOptions {
  /** The fetch to ask with (scripts inject their own, and tests a stub); globalThis.fetch by default. */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}
export declare function fetchAsset(url: string, init?: RequestInit, options?: FetchAssetOptions): Promise<Response>;
