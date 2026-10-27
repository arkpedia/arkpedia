import aliases from '@/config/pilot-route-aliases.json';

/** Published search indexes may retain the old public names until their next export. */
export function canonicalPublicHref(href: string): string {
  const boundary = href.search(/[?#]/);
  const pathname = boundary < 0 ? href : href.slice(0,boundary);
  const destination = Object.hasOwn(aliases.routes,pathname) ? (aliases.routes as Record<string,string>)[pathname] : undefined;
  return destination ? destination + (boundary < 0 ? '' : href.slice(boundary)) : href;
}
