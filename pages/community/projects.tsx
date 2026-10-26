import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import Image, { ContentArt } from '@/components/content/ContentImage';
import InfoPopover from '@/components/ui/InfoPopover';

const projects = [
  {
    id: 'chibis', category: 'Desktop companion', name: 'Arkpedia Desktop Chibis',
    description: 'Bring operators and enemies to your desktop, with outfits, animations and an offline model library.',
    platform: 'Windows · macOS · Linux', href: 'https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest', action: 'Get desktop chibis',
    source: 'https://github.com/arkpedia/arkpedia-desktop-chibis',
  },
  {
    id: 'stronghold', category: 'Browser game · English', name: 'Stronghold Protocol',
    description: 'Play the community remake of Stronghold Protocol: Alliance, solo or with friends. English server hosted by Yuri.',
    platform: 'stronghold-en.dev', href: 'https://stronghold-en.dev/', action: 'Play Stronghold Protocol',
    source: 'https://github.com/YuriRestia/Stronghold-Protocol-EN-translation',
    mark: '/mode-marks/stronghold-protocol.webp',
  },
  {
    id: 'timo', category: 'Story reader', name: 'Timo’s Arknights Story Reader',
    description: 'Read main stories, side stories and operator records, with a story map, reading order and progress tracking.',
    platform: 'arknights.timo.beer', href: 'https://arknights.timo.beer/', action: 'Read the stories',
    art: '/story-map/timo-main_17-3e77ce8108.webp',
  },
];

export default function CommunityProjectsPage() {
  return <>
    <Head><title>Community projects — Arkpedia</title><meta name="description" content="Fan-made Arknights games, story readers and desktop companions." /></Head>
    <PageHeader eyebrow="Rhodes Island // Community projects" title="Community projects" sub={<>Play, read and bring a little more Terra into your day. <InfoPopover label="About community projects"><p>These independent fan projects are maintained by their own creators. External sites and downloads have their own privacy information, terms and support.</p></InfoPopover></>} />
    <main>
      <div className="community-projects-grid">
        {projects.map(project => <article className="community-project" key={project.id} aria-labelledby={`project-${project.id}`}>
          <a href={project.href} target="_blank" rel="noopener noreferrer" className={`community-project-art community-project-art-${project.id}`} aria-label={project.action}>
            {project.mark ? <span className="community-project-game" aria-hidden="true"><ContentArt src={project.mark} className="community-project-game-mark" /><span>Stronghold<br />Protocol</span></span> : project.art ? <Image src={project.art} alt="" width={640} height={400} sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
              : <div className="community-project-desktop" aria-hidden="true"><div className="community-project-window"><span /><span /><span /></div><ContentArt src="/essential-icons/Arkpedia.webp" className="community-project-mark" /><div className="community-project-dock"><span /><span /><span /></div></div>}
          </a>
          <div className="community-project-copy">
            <span className="label-tag">{project.category}</span>
            <h2 id={`project-${project.id}`}>{project.name}</h2>
            <p>{project.description}</p>
            <span className="community-project-platform">{project.platform}</span>
            <div className="community-project-actions">
              <a className="primary btn-sm" href={project.href} target="_blank" rel="noopener noreferrer">{project.action} ↗</a>
              {project.source && <a className="ghost btn-sm" href={project.source} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
            </div>
          </div>
        </article>)}
      </div>
    </main>
  </>;
}
