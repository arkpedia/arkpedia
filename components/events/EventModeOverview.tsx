import { useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import type { ModeDetails } from '@/lib/events/modeDetails';

/** Official illustrations stay readable at full size; captions provide a text alternative. */
export default function EventModeOverview({ mode }: { mode: ModeDetails }) {
  const [opened, setOpened] = useState<NonNullable<ModeDetails['panels']>[number] | null>(null);
  return <>
    <p>{mode.description[0]}</p>
    <dl className="event-mode-facts">
      {mode.globalLaunch && <div><dt>Global launch</dt><dd>{mode.globalLaunch}</dd></div>}
      <div><dt>Unlock</dt><dd>{mode.unlock}</dd></div>
      <div><dt>Availability</dt><dd>Permanent mode</dd></div>
    </dl>
    <h3>Rewards</h3>
    <p>{mode.rewards}</p>
    <div className="event-mode-links" aria-label="Official sources">
      <a className="ghost" href={mode.source} target="_blank" rel="noopener noreferrer">Global announcement ↗</a>
      {mode.guides?.map(guide => <a className="ghost" key={guide.url} href={guide.url} target="_blank" rel="noopener noreferrer">{guide.label} ↗</a>)}
    </div>
    {mode.panels?.length ? <>
      <h2>Official mechanics guide</h2>
      <p className="hint">Select a panel to read the original at full size.</p>
      <div className="event-mode-gallery">
        {mode.panels.map(panel => <figure className="event-mode-panel" key={panel.image}>
          <button type="button" className="btn-bare directory-card lift event-mode-image" aria-label={`Enlarge ${panel.title}`} aria-haspopup="dialog" onClick={() => setOpened(panel)}>
            <ContentImg src={panel.image} alt={panel.title} width={panel.width} height={panel.height} />
          </button>
          <figcaption><h3>{panel.title}</h3><p>{panel.description}</p></figcaption>
        </figure>)}
      </div>
    </> : mode.description.slice(1).map(line => <p key={line}>{line}</p>)}
    {opened && <SkinZoomOverlay image={opened.image} name={opened.title} dynamic={null} onClose={() => setOpened(null)} />}
  </>;
}
