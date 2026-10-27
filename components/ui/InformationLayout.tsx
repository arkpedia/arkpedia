import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

/** Shared reading layout for site information and privacy settings. */
export default function InformationLayout({ sections, children }: { sections: { id: string; label: string }[]; children: ReactNode }) {
  const { pathname } = useRouter();
  return <main className="information-layout">
    <aside className="information-sidebar">
      <nav aria-label="Site information" className="information-pages">
        {[['/about', 'About Arkpedia'], ['/privacy', 'Privacy notice'], ['/cookies', 'Privacy choices']].map(([href, label]) => <Link className="site-nav-popitem" key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <nav aria-label="On this page" className="information-contents"><p className="label-tag">On this page</p>{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}</nav>
    </aside>
    <div className="information-content">{children}</div>
  </main>;
}
