import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import PROJECT_ART from '@/config/community-project-art.json';
import Image, { ApplicationImage, ContentArt } from '@/components/content/ContentImage';
import InfoPopover from '@/components/ui/InfoPopover';
import dynamic from 'next/dynamic';
import type { ChibiModel } from '@/lib/operators/chibi';
const DesktopChibisArt = dynamic(() => import('@/components/community/DesktopChibisArt'), { ssr: false });



interface CommunityProject { id: string; category: string; name: string; description: string; platform?: string; href?: string; wiki?: string; action: string; source?: string; mark?: string; art?: string; logo?: string }

export default function CommunityProjectsPage({ chibis }: { chibis: { name: string; model: ChibiModel }[] }) {
  const record = useReleaseTable<{ projects: CommunityProject[] }>('community-projects');
  const projects = record.projects.map(project => ({ ...project, href: project.href ?? project.wiki!, platform: project.platform ?? new URL(project.wiki!).hostname }));
  return <>
    <PageMeta title="Community projects" description="Fan-made Arknights tools, wikis, games, story readers and desktop companions." path="/community/projects" />
    <PageHeader eyebrow="Rhodes Island // Community projects" title="Community projects" sub={<>Tools, wikis, games and more from the Arknights community. <InfoPopover label="About community projects"><p>These independent fan projects are maintained by their own creators. External sites and downloads have their own privacy information, terms and support.</p></InfoPopover></>} />
    <main>
      <div className="community-projects-grid">
        {projects.map(project => <article className="panel community-project" key={project.id} aria-labelledby={`project-${project.id}`}>
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

export const getStaticProps = withContentPage('/community/projects', async () => {
  // Only these two pinned showcase models belong to the code-owned directory.
  // Importing the full catalogue adds 3.16 MB to every Worker cold start.
  return { props: { chibis: PROJECT_ART.companions } };
}, { bundledWhenUnpublished: true, tables: { 'community-projects': async () => (await import('@/data/community-projects.json')).default } });
