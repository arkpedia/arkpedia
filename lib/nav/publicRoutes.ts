import aliases from '@/config/pilot-route-aliases.json';

/** Published search indexes may retain the old public names until their next export. */
export function canonicalPublicHref(href: string): string {
  const boundary = href.search(/[?#]/);
  const pathname = boundary < 0 ? href : href.slice(0,boundary);
  // Older published search indexes may still link the former standalone page.
  if (pathname === '/friends') {
    const url = new URL(href, 'https://arkpedia.net');
    url.pathname = '/account';
    url.searchParams.set('panel', 'friends');
    return `${url.pathname}${url.search}${url.hash}`;
  }
  const destination = Object.hasOwn(aliases.routes,pathname) ? (aliases.routes as Record<string,string>)[pathname] : undefined;
  return destination ? destination + (boundary < 0 ? '' : href.slice(boundary)) : href;
}
