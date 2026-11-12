import Link from 'next/link';
import BaseSkillText from '@/components/operators/BaseSkillText';
import { ContentImg } from '@/components/content/ContentImage';
import { useEffect, useRef, useState } from 'react';
import { buildGachaOperatorPreview, type GachaOperatorPreview, type OperatorPreviewSource } from '@/lib/gacha/operatorPreviewData';
import type { SupportUnit } from '@/lib/account/accountStore';
import type { Owned } from '@/lib/planner/roster';
import type { PulledItem } from '@/lib/gacha/gachaTypes';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import SegmentedControl from '@/components/ui/SegmentedControl';
import XButton from '@/components/ui/XButton';
import { operatorHref } from '@/lib/operators/operatorHref';
import SkillRank from './SkillRank';
import PreviewArtwork from './PreviewArtwork';
import { StatReadout } from './OperatorStatsPanel';

export type OperatorPreviewItem = Pick<PulledItem, 'name' | 'icon'> & { rarity: number; build?: Owned; rosterContext?: boolean; support?: SupportUnit; initialSkill?: number };

/* A tab panel that keeps the tallest height it has had for this operator (the Anti-Page
   Jump rule's floor, reset per logical page): the preview scrolls inside itself, and a
   shorter panel clamped that scroll and moved the tabs under the reader's pointer (a module
   or stage 136px, Lin's S1 after the longer S3 45px). Every tab strip in the preview takes
   it. `hold` runs in the handler, before the switch. */
function usePanelFloor(page: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [floor, setFloor] = useState<{ page: string; px: number } | null>(null);
  const hold = () => {
    const el = ref.current;
    if (!el) return;
    const px = Math.ceil(el.getBoundingClientRect().height);
    setFloor((current) => ({ page, px: Math.max(current && current.page === page ? current.px : 0, px) }));
  };
  return { ref, hold, style: floor && floor.page === page ? { minHeight: floor.px } : undefined };
}

export function OperatorPreview({ item, onClose, nativeModal = false }: { item: OperatorPreviewItem; onClose: () => void; nativeModal?: boolean }) {
  const modal = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [details, setDetails] = useState<GachaOperatorPreview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(0);
  const [selectedModule, setSelectedModule] = useState(0);
  const [selectedStage, setSelectedStage] = useState(0);
  const skillPanel = usePanelFloor(item.name);
  const modulePanel = usePanelFloor(item.name);
  useEffect(() => {
    const element = modal.current;
    const ownerDocument = element?.ownerDocument ?? document;
    const previousFocus = ownerDocument.activeElement as HTMLElement | null;
    const parentDialog = previousFocus?.closest('dialog');
    const parentScrollTop = parentDialog?.scrollTop;
    const previousOverflow = ownerDocument.body.style.overflow;
    // A native preview sits above the selector, which owns its scroll lock.
    if (!nativeModal) ownerDocument.body.style.overflow = 'hidden';
    if (nativeModal) element?.showModal();
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    if (!nativeModal) ownerDocument.addEventListener('keydown', onKeyDown);
    return () => {
      ownerDocument.removeEventListener('keydown', onKeyDown);
      if (nativeModal) element?.close();
      if (!nativeModal) ownerDocument.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
      // Closing a native dialog can scroll its opener before preventScroll focus runs.
      if (parentDialog && parentScrollTop !== undefined) parentDialog.scrollTop = parentScrollTop;
    };
  }, [onClose, nativeModal]);
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null);
    setLoadError(false);
    setSelectedSkill(item.initialSkill??0);
    fetch(`/api/gacha-operator/${encodeURIComponent(item.name)}${item.build ? '?progression=1' : ''}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Operator details unavailable'); return response.json() as Promise<GachaOperatorPreview | OperatorPreviewSource>; })
      .then((data) => {
        const operator = item.build ? buildGachaOperatorPreview(data as OperatorPreviewSource, item.build) : data as GachaOperatorPreview;
        setDetails(operator);
        const moduleIndex = operator.modules.findIndex((module) => module.type === 'Upgrade');
        const nextModule = moduleIndex < 0 ? 0 : moduleIndex;
        setSelectedModule(nextModule);
        setSelectedStage(Math.max(0, (operator.modules[nextModule]?.stages.length ?? 1) - 1));
      })
      .catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(true); });
    return () => controller.abort();
  }, [item.name, item.build, item.initialSkill]);
  const artFolder = ({1:'one',2:'two',3:'three',4:'four',5:'five',6:'six'} as Record<number, string>)[item.rarity] ?? 'six';
  const art = `/${artFolder}-star-skins/${encodeURIComponent(`${item.name} - Base.webp`)}`;
  const selectedModuleData = details?.modules[selectedModule];
  const moduleStage = selectedModuleData?.stages[selectedStage];
  const skill = details?.skills[selectedSkill];
  const content = (
      <div className="modal-box gacha-pull-preview" role={nativeModal ? undefined : "dialog"} aria-modal={nativeModal ? undefined : true} aria-labelledby={nativeModal ? undefined : "gacha-pull-preview-title"} onClick={(event) => event.stopPropagation()}>
        <div className="gacha-pull-preview-header">
          <div><span className="gacha-pull-preview-rarity"><Rarity n={rarityLevel(item.rarity)} /> Operator{details?.className ? ` · ${details.className}` : ''}{details?.branch ? ` / ${details.branch}` : ''}</span><h2 id="gacha-pull-preview-title">{item.name}</h2></div>
          <XButton ref={closeButton} className="gacha-preview-close" onClick={onClose} label="Close operator preview" />
        </div>
        <div className="gacha-preview-body">
          <div className="gacha-preview-portrait">
            <PreviewArtwork src={art} alt={`${item.name} base artwork`} />
            <Link className="gacha-preview-link" href={operatorHref(item.name, null)}>View operator page ↗</Link>
          </div>
          <div className="gacha-preview-data" role="region" aria-label={`${item.name} operator details`} tabIndex={0}>
            {item.support&&<section className="gacha-preview-section" aria-label="Equipped support build">
              <h3>Equipped support</h3>
              <p>E{item.support.elite} Lv{item.support.level}{item.support.potential?` · Potential ${item.support.potential}`:''}</p>
              <p>{item.support.skill?`Skill ${item.support.skill}`:'Skill unknown'} · {item.support.skillMastery==null?'Mastery unknown':`M${item.support.skillMastery}`}{item.support.module?` · Module level ${item.support.moduleLevel??'unknown'}`:' · No module equipped'}</p>
              {!item.build&&<p className="hint">Reference details below show maximum upgrades.</p>}
            </section>}
            {item.rosterContext && !item.build && <p className="hint">Build not recorded. Showing reference maximums.</p>}
            {!details && !loadError && <p className="gacha-preview-loading" role="status">Loading operator details…</p>}
            {loadError && <p className="gacha-preview-loading" role="status">Details are unavailable right now. The operator page is still linked beside the artwork.</p>}
            {details?.stats && <section className="gacha-preview-section">
              <h3>Stats <span>E{details.stats.elite} Lv {details.stats.level} · max trust{item.build ? ' estimate' : ''}</span></h3>
              <StatReadout
                primary={([['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['res', 'RES']] as const).map(([key, label]) => {
                  const trust = key === 'res' ? 0 : details.stats!.trust[key];
                  return { key, label, base: details.stats!.values[key], trust, total: details.stats!.values[key] + trust };
                })}
                secondary={[
                  { key: 'dp', label: 'DP cost', value: details.stats.values.dp },
                  { key: 'block', label: 'Block count', value: details.stats.values.block },
                  { key: 'interval', label: 'Attack interval', value: details.stats.values.interval, unit: 's' },
                  { key: 'redeploy', label: 'Redeploy time', value: details.stats.values.redeploy, unit: 's' },
                ]}
              />
            </section>}
            {/* A trait that changes is one entry per promotion, its stage where a talent's is.
                `?.` on the list: a response cached from before it existed has none. */}
            {!!details?.traitPhases?.length && <section className="gacha-preview-section">
              <h3>Trait</h3>
              {details.traitPhases.map((line) => line.stage
                ? <div className="gacha-preview-entry" key={line.stage}>
                  <div className="gacha-preview-entry-title"><span>{line.stage}</span></div>
                  <p>{line.text}</p>
                </div>
                : <p key="trait">{line.text}</p>)}
            </section>}
            {!!details?.talents.length && <section className="gacha-preview-section">
              <h3>Talents</h3>
              {details.talents.map((talent, index) => <div className="gacha-preview-entry" key={`${talent.name}-${index}`}>
                <div className="gacha-preview-entry-title"><strong>{talent.name}</strong>{talent.stage && <span>{talent.stage}</span>}</div>
                <p>{talent.description}</p>
              </div>)}
            </section>}
            {!!details?.skills.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Skills</h3>
              <Tabs label="Skill" id="gacha-preview-skill" className="gacha-preview-tabs" value={selectedSkill} onChange={(index) => { skillPanel.hold(); setSelectedSkill(index); }}
                options={details.skills.map((entry, index) => ({
                  value: index,
                  label: `S${index + 1}`,
                  // The name starts with what the tab shows (WCAG 2.5.3): "click S1" in
                  // voice control finds it.
                  ariaLabel: `S${index + 1}${entry.name ? `: ${entry.name}` : ''}`,
                  title: entry.name || undefined,
                  icon: entry.icon ? <ContentImg src={entry.icon} alt="" width={28} height={28} /> : undefined,
                }))} />
              {skill && <div ref={skillPanel.ref} className="gacha-preview-entry" {...tabPanelProps('gacha-preview-skill', selectedSkill)} style={skillPanel.style}>
                <div className="gacha-preview-entry-title"><strong>{skill.name}</strong><SkillRank rank={skill.rank} /></div>
                <div className="gacha-preview-skill-facts">
                  {skill.recovery && <span className={`gacha-preview-skill-fact${/^auto/i.test(skill.recovery) ? ' auto' : /^(?:offensive|defensive)/i.test(skill.recovery) ? ' amber' : ''}`}>{skill.recovery}</span>}
                  {skill.activation && <span className={`gacha-preview-skill-fact${/^auto/i.test(skill.activation) ? ' auto' : /^manual/i.test(skill.activation) ? ' amber' : ''}`}>{skill.activation}</span>}
                  {skill.spCost !== null && <span className="gacha-preview-skill-fact sp">{skill.initialSp ?? 0}/{skill.spCost} SP</span>}
                  {skill.duration !== null && <span className="gacha-preview-skill-fact">{typeof skill.duration === 'number' || /^\d+(?:\.\d+)?$/.test(String(skill.duration)) ? `${skill.duration}s` : skill.duration}</span>}
                </div>
                <p>{skill.description || 'No skill description is available yet.'}</p>
              </div>}
            </section>}
            {!!details?.modules.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Modules</h3>
              <Tabs label="Module" id="gacha-preview-module" className="gacha-preview-tabs gacha-preview-module-tabs" value={selectedModule}
                onChange={(index) => { modulePanel.hold(); setSelectedModule(index); setSelectedStage(Math.max(0, (details.modules[index]?.stages.length ?? 1) - 1)); }}
                options={details.modules.map((entry, index) => ({ value: index, label: entry.name }))} />
              <div ref={modulePanel.ref} {...tabPanelProps('gacha-preview-module', selectedModule)} style={modulePanel.style}>
                {/* The module's stage is a value picked from 1-3, not a panel of its own:
                    the operator page's module stage is the same SegmentedControl. */}
                {selectedModuleData?.stages.length ? <>
                  <SegmentedControl label="Module stage" className="gacha-preview-stages" value={selectedStage} onChange={(stage) => { modulePanel.hold(); setSelectedStage(stage); }}
                    options={selectedModuleData.stages.map((entry, index) => ({ value: index, label: entry.stage }))} />
                  {moduleStage && <div className="gacha-preview-entry">
                    {moduleStage.attributes && <div className="gacha-preview-meta">{moduleStage.attributes}</div>}
                    {moduleStage.label && <strong>{moduleStage.label}</strong>}
                    {moduleStage.effect && <p>{moduleStage.effect}</p>}
                  </div>}
                </> : <p>Original trait; no module upgrades.</p>}
              </div>
            </section>}
            {!!details?.baseSkills?.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Base Skills</h3>
              <div className="gacha-preview-base-skills">
                {details.baseSkills.map((baseSkill, index) => <div className="gacha-preview-base-skill" key={`${baseSkill.name}-${index}`}>
                  {baseSkill.icon && <ContentImg src={baseSkill.icon} alt="" width={36} height={36} />}
                  <div>
                    <strong>{baseSkill.name}</strong>
                    {(baseSkill.facility || baseSkill.unlock) && <div className="gacha-preview-meta">{[baseSkill.facility, baseSkill.unlock].filter(Boolean).join(' · ')}</div>}
                    <p><BaseSkillText text={baseSkill.description} keywords={baseSkill.keywords} /></p>
                  </div>
                </div>)}
              </div>
            </section>}
          </div>
        </div>
      </div>
  );
  // A selector is already a native dialog. Its preview needs its own top-layer
  // dialog so it remains interactive while the selector keeps its scroll and focus.
  return nativeModal ? <dialog ref={modal} className="operator-preview-dialog" aria-labelledby="gacha-pull-preview-title"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={onClose}>
    {content}
  </dialog> : <div className="modal-overlay gacha-operator-overlay" onClick={onClose}>{content}</div>;
}
