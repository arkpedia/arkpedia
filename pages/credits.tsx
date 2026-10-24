import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import { CREDIT_GROUPS, OWN_REPOSITORIES, linkLabel } from '@/lib/credits/sources';
import { SPINE_RUNTIMES_LICENSE } from '@/lib/credits/spineLicense';
import { SIL_OPEN_FONT_LICENSE, WEBFONTS } from '@/lib/credits/fonts';

/* The sources the site is built on (lib/credits/sources.ts), each with its links, and the licences
   it is used under. The Spine Runtimes License and the fonts' SIL Open Font License have to ship
   with the site word for word; each waits behind its disclosure at the foot of the page. */

function Links({ links }: { links: string[] }) {
  return (
    <span className="credits-links">
      {links.map((href) => <a key={href} href={href} target="_blank" rel="noopener noreferrer">{linkLabel(href)}</a>)}
    </span>
  );
}

export default function CreditsPage() {
  return (
    <>
      <Head><title>Credits — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // Credits" title="Credits"
        sub="The projects and sites Arkpedia is built on, and the licences it uses." />
      <main>
        <section className="op-section">
          <p className="credits-intro">
            Arknights and its art, the animated outfit art included, belong to Hypergryph and Yostar.
            Arkpedia is a fan site and shows them for reference. Its data comes from the game and from
            the community projects below. Thank you to everyone who keeps them going.
          </p>
        </section>

        {CREDIT_GROUPS.map((group) => (
          <section key={group.id} className="op-section" aria-labelledby={`credits-${group.id}`}>
            <h2 id={`credits-${group.id}`}>{group.title}</h2>
            <ul className="credits-list">
              {group.sources.map((source) => (
                <li key={source.name}>
                  <span className="credits-name">{source.name}</span>
                  <Links links={source.links} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="op-section" aria-labelledby="credits-arkpedia">
          <h2 id="credits-arkpedia">Arkpedia&apos;s own data</h2>
          <ul className="credits-list is-links">
            {OWN_REPOSITORIES.map((href) => <li key={href}><Links links={[href]} /></li>)}
          </ul>
        </section>

        <section className="op-section" id="licences" aria-labelledby="credits-licences">
          <h2 id="credits-licences">Licences</h2>
          <p className="credits-copy">
            The animated outfit art plays with the Spine Runtimes (spine-ts 3.8), copyright Esoteric
            Software LLC. Arkpedia holds a Spine Essential licence, and uses the runtimes under the
            Spine Runtimes License.{' '}
            <a href="https://esotericsoftware.com/spine-runtimes-license" target="_blank" rel="noopener noreferrer">Licence</a>
            {' · '}
            <a href="https://github.com/EsotericSoftware/spine-runtimes/tree/3.8" target="_blank" rel="noopener noreferrer">Source</a>
          </p>
          <details className="credits-disclosure">
            <summary>Spine Runtimes License</summary>
            <pre className="credits-licence">{SPINE_RUNTIMES_LICENSE}</pre>
          </details>
          <div className="credits-fonts">
            <p className="credits-copy">
              The site&apos;s typefaces are {WEBFONTS.map((font) => font.family).join(', ').replace(/, ([^,]*)$/, ' and $1')},
              served by Arkpedia itself under the SIL Open Font License 1.1.
            </p>
            <ul className="credits-list">
              {WEBFONTS.map((font) => (
                <li key={font.family}>
                  <span className="credits-name">{font.family}</span>
                  <span className="credits-notice">{font.copyright}</span>
                  <Links links={[font.link]} />
                </li>
              ))}
            </ul>
            <details className="credits-disclosure">
              <summary>SIL Open Font License 1.1</summary>
              <pre className="credits-licence">{SIL_OPEN_FONT_LICENSE}</pre>
            </details>
          </div>
        </section>
      </main>
    </>
  );
}
