import { checkMaterialCatalogue, type MaterialCatalogue } from './materialCatalogue.mjs';

/** Bundled material records for content/page builders and older-release fallback.
 * Server-only: keep the JSON import out of the client-safe catalogue helpers. */
export async function loadMaterialCatalogue(): Promise<MaterialCatalogue> {
  return checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default);
}
