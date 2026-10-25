export declare const DELIVERY_PREFIX: string;
export function deliveryBaseUrl(origin: string, reference: { manifestSha256: string; revision: string }, options?: { allowLocalHttp?: boolean }): string;
interface DeliveryObject {
  size: number;
  body?: ReadableStream<Uint8Array>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}
export function createR2Delivery(options: {
  bucket: { get(key: string): Promise<DeliveryObject | null> };
  cache?: Pick<Cache, 'match' | 'put'>;
  fallbackToGithub?: boolean;
  serveStagingPointer?: boolean;
  fetchImpl?: typeof fetch;
  manifestCacheSize?: number;
  maxActiveReads?: number;
  maxQueuedReads?: number;
}): (request: Request) => Promise<Response | null>;
