import type { MediaDeliveryMaps } from '../assets/mediaDelivery.mjs';
export const CONTENT_SCHEMA = 2;

export interface ContentFile { path: string; sha256: string; bytes: number }
export interface ContentPointer { schema: number; release: string; revision: string; manifestSha256: string }
export interface ContentManifest {
  schema: number;
  release: string;
  generatedAt: string;
  generator: string;
  assets: Record<string, string>;
  pages: Record<string, ContentFile>;
  files: Record<string, ContentFile>;
}

/** Serialized with a page; all requests during that visit keep this release. */
export interface ContentRelease {
  release: string;
  baseUrl: string;
  media?: MediaDeliveryMaps;
  assets: Record<string, string>;
}

export function contentRoute(template: string, params: Record<string, string | string[] | undefined> = {}): string {
  return template.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const value = params[key];
    if (typeof value !== 'string') throw new Error(`Missing content route parameter ${key}`);
    return encodeURIComponent(value);
  });
}
