import { useEffect, useState } from 'react';
import { fetchAsset } from '@/lib/assets/assetRetry';
import ProjectedHomeLayout, { type ProjectedLayout } from './ProjectedHomeLayout';
import { ContentImg } from '@/components/content/ContentImage';
import type { HomeMenuItem, HomeTheme, ThemeArt } from '@/lib/home/previews';

function ThemeImage({ art, label = '', className }: { art: ThemeArt; label?: string; className?: string }) {
  return <ContentImg eager src={art.image} width={art.width} height={art.height}
    alt={label} className={className} draggable={false} />;
}

function MenuArt({ item }: { item: HomeMenuItem }) {
  return <span className="event-home-menu-art">
    {item.art ? <ThemeImage art={item.art} label={item.label} /> : <span className="event-home-menu-label">{item.label}</span>}
    {item.caption && <ThemeImage art={item.caption} className="event-home-menu-caption" />}
  </span>;
}

export default function EventHomeTheme({ theme, animationStart }: { theme: HomeTheme; animationStart: number }) {
  const { layout } = theme;
  const [loaded, setLoaded] = useState<{ source: string; data?: ProjectedLayout }>();
  useEffect(() => {
    if (!layout) return;
    const source = layout.manifest;
    const controller = new AbortController();
    void fetchAsset(source, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Home layout unavailable');
      const data: ProjectedLayout = await response.json();
      if (!data.width || !data.height || !Array.isArray(data.layers) || !data.motion?.left || !data.motion?.right) {
        throw new Error('Home layout is incomplete');
      }
      if (!controller.signal.aborted) setLoaded({ source, data });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded({ source });
    });
    return () => controller.abort();
  }, [layout]);
  if (layout) {
    if (loaded?.source !== layout.manifest) return null;
    if (loaded.data) return <ProjectedHomeLayout layout={loaded.data} artRoot={layout.artRoot}
      theme={theme} animationStart={animationStart} />;
  }
  const { assistant, decoration, profile, recruitment, shortcuts } = theme;
  return <section className="event-home" aria-label={`${theme.name} home screen`}>
    <div className="event-home-status">
      {profile && <div className="event-home-profile">
        <span>{profile.name}</span>
        <span className="event-home-level">LV {profile.level}</span>
      </div>}
      <div className="event-home-terminal">
        <MenuArt item={theme.terminal} />
        {profile && <div className="event-home-sanity">
          <ThemeImage art={profile.sanity.plus} />
          <ThemeImage art={profile.sanity.title} label="Sanity" />
          <span>{profile.sanity.current}/{profile.sanity.capacity}</span>
        </div>}
      </div>
    </div>
    <div className="event-home-body">
      {decoration && <ThemeImage art={decoration} className="event-home-decoration" />}
      {assistant && <>
        <ThemeImage art={assistant.art} label={assistant.name} className="event-home-assistant" />
        <div className="event-home-voice" aria-hidden="true">
          <ThemeImage art={assistant.voice} />
          <span>{assistant.name}</span>
        </div>
      </>}
    </div>
    <div className="event-home-navigation">
      <ul className="event-home-main" aria-label="Main menu">
        {theme.navigation.map(item => <li key={item.label}><MenuArt item={item} /></li>)}
      </ul>
      {(recruitment || shortcuts) && <div className="event-home-secondary">
        {recruitment && <div className="event-home-recruitment">
          <MenuArt item={recruitment.heading} />
          <div className="event-home-recruitment-choices">
            {recruitment.choices.map(item => <MenuArt item={item} key={item.label} />)}
          </div>
        </div>}
        {shortcuts && <ul className="event-home-shortcuts" aria-label="Shortcuts">
          {shortcuts.map(item => <li key={item.label}><MenuArt item={item} /></li>)}
        </ul>}
      </div>}
    </div>
  </section>;
}
