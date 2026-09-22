/** Global is Arkpedia's default. Keep region suffixes for CN banners and keep
 * the stored name untouched: it is also the key used by saved pull plans. */
export function bannerDisplayName(name: string): string {
  return name.replace(/\s*\(Global\)\s*$/i, '').trim();
}
