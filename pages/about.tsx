import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import InformationLayout from '@/components/ui/InformationLayout';
export default function AboutPage() {
  return <><Head><title>About Arkpedia — Arkpedia</title></Head>
    <PageHeader eyebrow="Rhodes Island // About" title="About Arkpedia" sub="An independent Arknights community reference and planning site." />
    <InformationLayout sections={[{id:'people',label:'People'}, {id:'credits',label:'Project & credits'}, {id:'contact',label:'Contact'}]}><section id="people" className="information-section reading-copy"><h2 className="entity-title">The people behind Arkpedia</h2>
      <p>Arkpedia was founded by Kukkikaze. Its current main developer and maintainer is <span className="information-name">JungerMin</span>.</p>
      <p>Source code and community contributions: <a href="https://github.com/arkpedia/arkpedia" target="_blank" rel="noopener noreferrer">arkpedia/arkpedia ↗</a>.</p>
    </section><section id="credits" className="information-section reading-copy"><h2 className="entity-title">Fan project and credits</h2>
      <p>Arkpedia is an unofficial fan project and is not affiliated with or endorsed by Hypergryph, Yostar or their affiliates. Arknights names, characters, artwork, music and game data belong to their respective rights holders.</p>
      <p>Code, assets and third-party libraries have separate licences. See <Link href="/credits">Credits and licences</Link> for attribution and source links. Community projects linked from Arkpedia are independent services.</p>
      <p>The site is provided as a community resource. Game information and estimates can change; check the game before making purchases or other decisions.</p>
    </section><section id="contact" className="information-section reading-copy"><h2 className="entity-title">Contact and privacy</h2>
      <p>For privacy requests or rights-holder concerns, contact <span className="information-name">JungerMin</span> at <a href="mailto:jungermin@arkpedia.net">jungermin@arkpedia.net</a>. Please do not send passwords, login codes or game tokens.</p>
      <div className="account-shortcuts"><Link className="btn ghost btn-sm" href="/privacy">Privacy notice</Link><Link className="btn ghost btn-sm" href="/cookies">Cookies & privacy choices</Link></div>
    </section></InformationLayout></>;
}
