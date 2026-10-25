import type { StagingPointer } from '../../lib/content/deliveryManifest.mjs';
export { releaseManifest } from '../../lib/content/deliveryManifest.mjs';

interface Bucket {
  get(key: string): Promise<{ size: number; etag: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, bytes: Uint8Array, options: { onlyIf: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<{ etag: string } | null>;
}
interface Candidate {
  manifestSha256: string;
  manifestBytes: number;
  revision: string;
  release: string;
  objectCount: number;
}
interface ObservedPointer { etag: string | null; generation: number; value: StagingPointer | null }
export function stageSnapshot(options: { bucket: Bucket; manifestBytes: Uint8Array; revision: string; readFile(path: string): Promise<Uint8Array>; concurrency?: number }): Promise<Candidate>;
export function readStagingPointer(bucket: Bucket): Promise<ObservedPointer>;
export function promoteStagingSnapshot(options: { bucket: Bucket; candidate: Candidate; expected: ObservedPointer; concurrency?: number }): Promise<ObservedPointer>;
