import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import PROJECT_ART from '@/config/community-project-art.json';
import Image, { ApplicationImage, ContentArt } from '@/components/content/ContentImage';
import InfoPopover from '@/components/ui/InfoPopover';
import dynamic from 'next/dynamic';
import type { ChibiModel } from '@/lib/operators/chibi';
const DesktopChibisArt = dynamic(() => import('@/components/community/DesktopChibisArt'), { ssr: false });

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
  {
    id: 'amiya', logo: PROJECT_ART.files.amiya, category: 'Minigames · Utilities', name: 'Amiya.io',
    description: 'Play Arknights guessing games and puzzles, browse operators and track your pulls.',
    platform: 'amiya.io', href: 'https://www.amiya.io/', action: 'Visit Amiya.io',
  },
  {
    id: 'penguin-statistics', logo: PROJECT_ART.files.penguinStatistics, category: 'Drop rates · Farming data', name: 'Penguin Statistics',
    description: 'Compare community-reported material drop rates and stage efficiency to plan your farming.',
    platform: 'penguin-stats.io', href: 'https://penguin-stats.io/', action: 'Visit Penguin Statistics',
  },
  {
    id: 'myrtle', logo: PROJECT_ART.files.myrtle, category: 'Companion tools', name: 'Myrtle.moe',
    description: 'Explore operator data, synced player profiles, calculators and base planning tools.',
    platform: 'myrtle.moe', href: 'https://myrtle.moe/', action: 'Visit Myrtle.moe',
  },
  {
    id: 'krooster', logo: PROJECT_ART.files.krooster, category: 'Roster · Upgrade planner', name: 'Krooster',
    description: 'Track and share your operator roster, plan upgrades and check recruitment options.',
    platform: 'krooster.com', href: 'https://www.krooster.com/', action: 'Visit Krooster',
  },
  {
    id: 'sanity-gone', logo: PROJECT_ART.files.sanityGone, category: 'Guides · Operator database', name: 'Sanity Gone',
    description: 'Find operator guides, reviews, detailed stats and recruitment tools.',
    platform: 'sanitygone.help', href: 'https://sanitygone.help/', action: 'Visit Sanity Gone',
  },
  {
    id: 'arknights-wiki', logo: PROJECT_ART.files.arknightsWiki, category: 'Wiki · English', name: 'Arknights wiki',
    description: 'Look up operators, events, game mechanics and the world of Terra on the English wiki.',
    platform: 'arknights.wiki.gg', href: 'https://arknights.wiki.gg/', action: 'Visit Arknights wiki',
  },
  {
    id: 'prts', logo: PROJECT_ART.files.prts, category: 'Wiki · Chinese', name: 'PRTS',
    description: 'Browse the Chinese Arknights wiki for operator data, stages, mechanics and stories.',
    platform: 'prts.wiki', href: 'https://prts.wiki/', action: 'Visit PRTS',
  },
];

export default function CommunityProjectsPage({ chibis }: { chibis: { name: string; model: ChibiModel }[] }) {
  return <>
    <PageMeta title="Community projects" description="Fan-made Arknights tools, wikis, games, story readers and desktop companions." path="/community/projects" />
    <PageHeader eyebrow="Rhodes Island // Community projects" title="Community projects" sub={<>Tools, wikis, games and more from the Arknights community. <InfoPopover label="About community projects"><p>These independent fan projects are maintained by their own creators. External sites and downloads have their own privacy information, terms and support.</p></InfoPopover></>} />
    <main>
      <div className="community-projects-grid">
        {projects.map(project => <article className="community-project" key={project.id} aria-labelledby={`project-${project.id}`}>
          {(project.id === 'chibis' || project.mark || project.art || project.logo) && <a href={project.href} target="_blank" rel="noopener noreferrer" className={`community-project-art community-project-art-${project.id}`} aria-label={project.action}>
            {project.logo ? <ApplicationImage className="community-project-logo" asset={{ repository: 'arkpedia-image-assets', revision: PROJECT_ART.revision, path: project.logo }} width={640} height={400} alt="" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" /> : project.mark ? <span className="community-project-game" aria-hidden="true"><ContentArt src={project.mark} className="community-project-game-mark" /><span>Stronghold<br />Protocol</span></span> : project.art ? <Image src={project.art} alt="" width={640} height={400} sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
              : <DesktopChibisArt models={chibis} />}
          </a>}
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

export async function getStaticProps() {
  // Only these two pinned showcase models belong to the code-owned directory.
  // Importing the full catalogue adds 3.16 MB to every Worker cold start.
  return { props: { chibis: PROJECT_ART.companions } };
}
