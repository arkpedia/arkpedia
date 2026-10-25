import type { ContentManifest } from './types';

export interface StagingPointer {
  format: 1;
  manifestSha256: string;
  manifestBytes: number;
  revision: string;
  release: string;
  generation: number;
}
export function stagingPointer(value: unknown): StagingPointer;
export function releaseManifest(bytes: Uint8Array): {
  manifest: ContentManifest;
  objects: Map<string, { sha256: string; bytes: number; key: string }>;
};
