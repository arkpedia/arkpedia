import { hasMasteryGuidance, hasMasteryPriority } from '@/lib/operators/skillRecommendation';
import { getModuleStageEffects } from '@/lib/operators/moduleEffects';
import { useContentUrl } from '@/lib/content/context';
import { cssUrl } from '@/lib/content/urls';
import { withContentPage } from '@/lib/content/server';
import { GetStaticPaths, GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllOperators, getOperatorByName } from '@/lib/operators/operators';
import { operatorPageNames } from '@/lib/operators/operatorPagePaths';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { portraitStatus } from '@/lib/operators/operatorPortrait';
import OperatorSearch from '@/components/operators/OperatorSearch';
import { operatorHref, isOperatorSection, OperatorSection } from '@/lib/operators/operatorHref';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import type { SearchableOperatorRecord as SearchableOperator } from '@/lib/operators/operatorSearch';
import { Operator, GuideEntry, SkillRecommendationEntry, SkillTechnique, getSkillList, getSkillCost, CostGroup, getWelfareInfo } from '@/lib/operators/operatorTypes';
import { MEMBER_TO_UMBRELLA, UMBRELLA_DESCRIPTIONS, skillTechniques, talentTechniques } from '@/lib/techniques/autoTechniques';
import { buildTechniqueGroups } from '@/lib/techniques/buildTechniqueGroups';
import { SYNERGY_CLASS_NAMES, findSynergyMatches, isSynergyExcluded } from '@/lib/techniques/synergyDetection';
import { getClassIconPath, getBranchIconPath, getFactionIconPath } from '@/lib/operators/classBranchIcons';
import { operatorReleaseLabel } from '@/lib/operators/operatorAvailability';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { fetchVideoOEmbedInfo } from '@/lib/music/youtube';
import {
  getOperatorAppearances,
  Appearance,
} from '@/lib/operators/operatorAppearances';
import SKILL_RANGES from '@/data/skill-ranges.json';
import SKILL_TIMINGS from '@/data/skill-timings.json';
import OPERATOR_DEPLOY from '@/public/operator-deploy.json';
import { getSkillTiming, SkillTiming } from '@/lib/operators/skillTiming';
import { getSkillIconPath, getBaseSkillIconPath, baseSkillDisplayName, talentDisplayName, getEssentialIconPath, getMaterialIconPath } from '@/lib/operators/operatorIconPaths';
import { getAllSkins } from '@/lib/skins/skins';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import { appearanceSkinId, operatorDynamicArt } from '@/lib/skins/dynamicArt';
import { withOperatorDynamicArt, loadDynamicArtIndex } from '@/lib/skins/dynamicArtFallback';
import { highlightStats } from '@/components/ui/HighlightedText';
import { CroppedRange } from '@/lib/operators/operatorAttackRanges';
import { getOperatorAttackRanges, OperatorAttackRange as AttackRangeChoice } from '@/lib/operators/operatorAttackRanges';
import OperatorAttackRange from '@/components/operators/OperatorAttackRange';
import { operatorBelongsToFaction } from '@/lib/operators/factionAliases';
import OPERATOR_FORMS from '@/data/operator-forms.json';
import OperatorChibi from '@/components/operators/OperatorChibi';
import type { ChibiFacings } from '@/lib/operators/chibi';
import OperatorSummons from '@/components/operators/OperatorSummons';
import type { Summon } from '@/lib/operators/summonStats';
import OperatorStatsPanel from '@/components/operators/OperatorStatsPanel';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import OperatorTalents from '@/components/operators/OperatorTalents';
import OperatorTraitLines from '@/components/operators/OperatorTraitLines';
import { traitPhases } from '@/lib/operators/operatorTrait';
import LodestarTalentDemo from '@/components/operators/LodestarTalentDemo';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import OperatorCredits from '@/components/operators/OperatorCredits';
import OperatorAppearancePicker from '@/components/operators/OperatorAppearancePicker';
import OperatorArtworkCaption from '@/components/operators/OperatorArtworkCaption';
import { getOperatorArtworkCredits, ArtworkCredit } from '@/lib/operators/operatorArtworkCredits';
import OperatorStatModifiers from '@/components/operators/OperatorStatModifiers';
import OperatorFilesPanel from '@/components/operators/OperatorFilesPanel';
import OperatorVoiceLines from '@/components/operators/OperatorVoiceLines';
import StyledSelect from '@/components/ui/StyledSelect';
import pageStyles from '@/components/operators/OperatorPage.module.css';
import { materialOrderFor, sortMaterials } from '@/lib/farming/materialSortOrder';
import { plannerCostNames } from '@/lib/farming/materialCatalogue.mjs';
import { loadMaterialCatalogue } from '@/lib/farming/materialCatalogueServer';
import { withMaterialOrder } from '@/lib/content/materialOrderFallback';
import { getOperatorVoiceData, OperatorVoiceData } from '@/lib/operators/operatorVoices';
import OperatorRelationPopover, { RelatedOperator } from '@/components/operators/OperatorRelationPopover';
import { useAssetUrl } from '@/lib/assets/assetRetry';

interface SynergyMatchOperator {
  name: string;
  rarity: number | null;
}

interface AutoSynergyBadge {
  label: string;
  skillIconPath: string | null;
  talentLabel: string | null;
  sourceText: string | null;
  matchedKeyword: string | null; // the faction/class name (or its demonym) as it literally appears in sourceText, for highlighting
}

interface AutoSynergyEntry {
  operatorName: string;
  operatorIconPath: string;
  isContributor: boolean;
  badges: AutoSynergyBadge[];
}

interface AutoSynergyGroup {
  name: string;
  type: 'faction' | 'class';
  entries: AutoSynergyEntry[]; // contributors first (rarity desc), then members (rarity desc), capped at 10 total, no pagination
}

/**
 * One of an operator's class forms. Amiya is the only operator the game gives these to:
 * three templates behind one name, switched in the field rather than raised separately.
 */
interface OperatorForm {
  name: string;
  label: string;
  internalName: string;
}

interface Props {
  chibis?: Record<string, ChibiFacings>;
  summons?: Summon[];
  epTrack?: { id: string; title: string; copyright: boolean } | null;
  overviewRanges: AttackRangeChoice[];
  artworkCredits: Record<string, ArtworkCredit>;
  factionEmblem: string | null;
  skillTimings: (SkillTiming | null)[][];
  operator: Operator;
  appearances: Appearance[];
  skinObtainByLabel: Record<string, string>; // appearance label (skin name) -> formatted price text, e.g. "18 OP" or "400 DC" -- only present for skins with a parseable certificate/OP price
  synergyMatches: SynergyMatchOperator[][]; // one entry per operator.synergies[i], parallel arrays
  autoSynergyGroups: AutoSynergyGroup[]; // auto-detected from skill/talent text mentioning this operator's own faction/class -- separate from the manually-authored operator.synergies above
  techniqueUnitIcons: Record<string, SearchableOperator>; // unit name -> resolved operator data, for techniques that reference another operator instead of a plain name
  techniqueBranchOperators: Record<string, SearchableOperator[]>; // branch name -> up to 5 operators of that branch, for techniques that reference a branch
  techniqueGroupOperators: Record<string, SearchableOperator[]>; // custom group name -> its member operators (supplied directly in the JSON, no icon)
  techniqueRelatedOperators: Record<string, { entries: SearchableOperator[]; totalCount: number }>; // technique name -> up to 4 OTHER operators (rarity desc) who share it, plus the full count, for the "show related operators" click-to-expand feature on plain techniques
  forms: OperatorForm[] | null; // every form of this operator, the viewed one included, from the game's own char_patch_table -- null for the 425 operators that have only one
  /** This operator's skills that change its attack range, by skill slot ("1", "2", "3").
   *  Absent for the operators whose skills all leave the range alone, which is most of
   *  them: 174 of 400-odd have any. Built by scripts/build-skill-ranges.mjs. */
  skillRanges: Record<string, SkillRangeChange> | null;
  voiceData: OperatorVoiceData | null;
  branchRelatedOperators: RelatedOperator[];
  relatedByArtist: Record<string, RelatedOperator[]>;
  relatedByVoiceActor: Record<string, RelatedOperator[]>;
  /** The release's material catalogue order (data/material-catalogue.json), for the materials
   *  this operator costs: what every cost row sorts by. */
  materialOrder: string[];
  /** Each animated artwork's model.json, by appearance label (data/dynamic-art.json,
   *  lib/skins/dynamicArt.ts): only the artworks that have one. Absent from a release compiled
   *  before animated art, where every artwork then opens as a still picture, as it did. */
  dynamicArt?: Record<string, string>;
}

/** One skill's effect on the range, from data/skill-ranges.json. */
interface SkillRangeChange {
  skillName: string | null;
  baseRangeId: string | null;
  baseRange: CroppedRange | null;
  /** One rangeId per skill level, indexed by the level's own position: 0-6 are levels
   *  1-7 and 7-9 are M1-M3. Always the full array, so it is read the same way whether
   *  or not the skill's range actually changes. */
  levelRangeIds: string[];
  /** The distinct grids those ids name -- one for all but four skills. Every id in
   *  levelRangeIds has an entry here; the build script fails rather than leave a hole. */
  grids: Record<string, CroppedRange>;
  /** Levels where the range differs from the level below ("M1", "Level 7"). Empty for
   *  a skill that holds one range throughout, which is all but four of them. */
  changesAt: string[];
}

/** "M1", or "Level 7 and M2" -- the levels a skill's range changes at. Every skill that
 *  changes today changes exactly once, so the plural branch is for a gamedata that
 *  stops being that tidy rather than for anything on the site now. */
function formatLevelList(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The artwork's `sizes`: the shown outfit, the one going out and the one fetched ahead
 *  all say the same, so the browser picks the same rendition for each and a fetched-ahead
 *  picture is the one shown. */
const ARTWORK_SIZES = '(max-width: 900px) 100vw, 40vw';
/** How long the artwork on screen waits for the next outfit's picture before it turns
 *  anyway (ms): lib/ui/imageArrival.ts's HOLD_MS, after which a picture that has not come
 *  is shown as it is. */
const WARM_WAIT_MS = 1500;

/* A form's label is its class, except that our class icons are filed under the class
   names our records use. Amiya's three labels happen to BE those names, so this is a
   pass-through today and the lookup exists so a future form labelled something other
   than its class does not silently lose its icon. */
const FORM_CLASS: Record<string, string> = {
  Caster: 'Caster', Guard: 'Guard', Medic: 'Medic',
};

/* The sections proper: every place the page can open at (lib/operators/operatorHref.ts)
   except its top, which the overview and the artwork are. */
type SectionKey = Exclude<OperatorSection, 'overview' | 'artwork'>;

function sumCostGroups(groups: (CostGroup | null | undefined)[]): CostGroup {
  const totals = new Map<string, number>();
  for (const group of groups) {
    if (!group) continue;
    for (const item of group) {
      const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 0;
      totals.set(item.name, (totals.get(item.name) || 0) + qty);
    }
  }
  return Array.from(totals.entries()).map(([name, quantity]) => ({ name, quantity }));
}

/** Renders a branch's cropped range grid as a small box -- amber tile
 * for the operator's own position, teal tiles for where they can
 * attack, using the operator-specific offsets from operatorAttackRanges.ts. A
 * branch like Fortress still shows the real gap between the operator
 * and their range. */
function RangeGridBox({ range, label }: { range: CroppedRange | null; label?: string }) {
  if (!range) return null;
  const CELL_PX = 16;
  return (
    <div className="op-range-grid-wrap" title={label ?? 'Elite 1 attack range'}>
      <div
        className="op-range-grid"
        style={{
          gridTemplateColumns: `repeat(${range.cols}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${range.rows}, ${CELL_PX}px)`,
        }}
      >
        <div
          className="op-range-cell op-range-cell-self"
          style={{ gridColumn: range.opCell[1], gridRow: range.opCell[0] }}
        />
        {range.rangeCells.map((c, i) => (
          <div key={i} className="op-range-cell" style={{ gridColumn: c[1], gridRow: c[0] }} />
        ))}
      </div>
    </div>
  );
}

function CostRow({ cost, order, promotion = false }: { cost: CostGroup | null | undefined; order: readonly string[]; promotion?: boolean }) {
  if (!cost || cost.length === 0) return <p className="hint">No cost data.</p>;
  const sorted = sortMaterials(cost, order);
  const renderItem = (item: CostGroup[number], index: number) => {
    const iconPath = getMaterialIconPath(item.name);
    return (
      <span key={`${item.name}-${index}`} className="op-cost-item" title={item.name}>
        {iconPath && <Image src={iconPath} alt={item.name} width={36} height={36} />}
        <b>×{item.quantity}</b>
      </span>
    );
  };
  return (
    <div className={`op-cost-row${promotion ? ` ${pageStyles.promotionCosts}` : ''}`}>
      {promotion ? (
        <>
          {sorted.filter(item => item.name === 'LMD').map(renderItem)}
          <span className={pageStyles.promotionMaterials}>
            {sorted.filter(item => item.name !== 'LMD').map(renderItem)}
          </span>
        </>
      ) : sorted.map(renderItem)}
    </div>
  );
}

function RecommendationBadge({ entries }: { entries: SkillRecommendationEntry[] | null | undefined }) {
  if (!entries || entries.length === 0) return null;
  const visible = entries.filter(hasMasteryPriority);
  if (visible.length === 0) return null;
  return (
    <span className="op-skill-recommend-stack">
      {visible.map((e, i) => (
        <span key={i} className="op-skill-recommend-row">
          {e.mastery && <>
            <span className={pageStyles.recommendArt} aria-hidden="true"><OperatorGameIcon label={e.mastery.toUpperCase()} color size={26} /></span>
            <span className={pageStyles.recommendLevel}>{e.mastery.toUpperCase()}</span>
          </>}
          {e.mastery && e.order && <span className="op-skill-recommend-dot">·</span>}
          {e.order && <span className="op-skill-recommend-mastery">{e.order}</span>}
        </span>
      ))}
    </span>
  );
}

/** Every umbrella description (Enhance Arts Damage, Elemental Damage,
 * etc.) that this technique name belongs to -- e.g. an operator with
 * "Burn" also shows Elemental Damage's own definition alongside it,
 * since Burn is a member of that umbrella. Empty if the technique
 * isn't in any umbrella, or its umbrella(s) have no definition of
 * their own (most umbrellas don't -- only ones with real
 * stacking/interaction rules that aren't obvious from the member list
 * alone, like Enhance Arts Damage and Elemental Damage). */
function getUmbrellaDefinitions(techName: string | null): string[] {
  if (!techName) return [];
  const umbrellas = MEMBER_TO_UMBRELLA[techName] || [];
  return umbrellas.map((u) => UMBRELLA_DESCRIPTIONS[u]).filter((d): d is string => !!d);
}

function TechniqueList({
  summary = "Mechanics & interactions",
  section,
  techniques,
  techniqueUnitIcons,
  techniqueBranchOperators,
  techniqueGroupOperators,
  techniqueRelatedOperators,
}: {
  summary?: string;
  /** The section the list is drawn in (Skills, or Talents for a talent's details): an
   *  operator it links to opens there (operatorHref). */
  section: OperatorSection;
  techniques: SkillTechnique[];
  techniqueUnitIcons: Record<string, SearchableOperator>;
  techniqueBranchOperators: Record<string, SearchableOperator[]>;
  techniqueGroupOperators: Record<string, SearchableOperator[]>;
  techniqueRelatedOperators: Record<string, { entries: SearchableOperator[]; totalCount: number }>;
}) {
  const [expandedTechniqueIndex, setExpandedTechniqueIndex] = useState<number | null>(null);
  return (
    <details className={pageStyles.mechanics}>
      <summary>{summary}</summary>
      <div className="op-skill-techniques">
      {techniques.map((t, ti) => {
        const unitData = t.unit ? techniqueUnitIcons[t.unit] : null;
        const branchOps = t.branch ? techniqueBranchOperators[t.branch] : null;
        const umbrellaDefs = getUmbrellaDefinitions(t.name);
        if (unitData) {
          return (
            <div key={ti} className="op-skill-technique-block">
              <div className="op-skill-technique-icons-row">
                <Link prefetch={false} href={operatorHref(unitData.name, section)} title={unitData.name}>
                  <Image src={getOperatorIconPath(unitData as Operator)} alt={t.unit || ''} width={40} height={40} className="op-skill-technique-unit-icon" />
                </Link>
              </div>
              <p className="op-skill-technique-row">
                <b>{talentDisplayName(t.name)}</b>
                {t.description && <span>: {t.description}</span>}
              </p>
              {umbrellaDefs.map((def, di) => (
                <p key={di} className="op-skill-technique-umbrella-def hint">
                  {def}
                </p>
              ))}
            </div>
          );
        }
        if (t.branch) {
          return (
            <div key={ti} className="op-skill-technique-block">
              <div className="op-skill-technique-icons-row">
                {getBranchIconPath(t.branch) && (
                  <OperatorGameIcon src={getBranchIconPath(t.branch)!} label={t.branch} size={28} />
                )}
                {branchOps &&
                  branchOps.map((op) => (
                    <Link prefetch={false} key={op.name} href={operatorHref(op.name, section)} title={op.name}>
                      <Image src={getOperatorIconPath(op as Operator)} alt={op.name} width={32} height={32} className="op-skill-technique-branch-op-icon" />
                    </Link>
                  ))}
              </div>
              <p className="op-skill-technique-row">
                <b>{talentDisplayName(t.name)}</b>
                {t.description && <span>: {t.description}</span>}
              </p>
              {umbrellaDefs.map((def, di) => (
                <p key={di} className="op-skill-technique-umbrella-def hint">
                  {def}
                </p>
              ))}
            </div>
          );
        }
        if (t.group) {
          const groupOps = techniqueGroupOperators[t.group];
          return (
            <div key={ti} className="op-skill-technique-block">
              <div className="op-skill-technique-unit-header">
                {t.name && <b>{talentDisplayName(t.name)}</b>}
                <span className="hint">{t.group}</span>
              </div>
              {t.description && <p className="op-skill-technique-description">{t.description}</p>}
              {umbrellaDefs.map((def, di) => (
                <p key={di} className="op-skill-technique-umbrella-def hint">
                  {def}
                </p>
              ))}
              {groupOps && groupOps.length > 0 && (
                <div className="op-skill-technique-branch-ops">
                  {groupOps.map((op) => (
                    <Link prefetch={false} key={op.name} href={operatorHref(op.name, section)} title={op.name}>
                      <Image src={getOperatorIconPath(op as Operator)} alt={op.name} width={32} height={32} className="op-skill-technique-branch-op-icon" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }
        const related = t.name ? techniqueRelatedOperators[t.name] : undefined;
        const isExpanded = expandedTechniqueIndex === ti;
        return (
          <div key={ti} className={related ? 'op-skill-technique-clickable' : undefined}>
            <p
              className="op-skill-technique-row"
              onClick={related ? () => setExpandedTechniqueIndex(isExpanded ? null : ti) : undefined}
              style={related ? { cursor: 'pointer' } : undefined}
            >
              <b>{talentDisplayName(t.name)}</b>
              {t.description && <span>: {t.description}</span>}
            </p>
            {umbrellaDefs.map((def, di) => (
              <p key={di} className="op-skill-technique-umbrella-def hint">
                {def}
              </p>
            ))}
            {related && isExpanded && (
              <div className="op-skill-technique-related-row">
                {related.entries.map((op) => (
                  <Link prefetch={false} key={op.name} href={operatorHref(op.name, section)} className="op-skill-technique-related-op" aria-label={op.name}>
                    <Image src={getOperatorIconPath(op as Operator)} alt={op.name} width={40} height={40} />
                  </Link>
                ))}
                <Link prefetch={false}
                  href={`/techniques?q=${encodeURIComponent(t.name || '')}`}
                  className="op-skill-technique-related-more"
                  aria-label={`See all ${related.totalCount} operators with ${t.name}`}
                >
                  +{related.totalCount - related.entries.length > 0 ? related.totalCount - related.entries.length : ''}
                  <span>See more</span>
                </Link>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </details>
  );
}

function GuideVideoCard({ guide, operatorName }: { guide: GuideEntry; operatorName: string }) {
  const [info, setInfo] = useState<{ title: string; author: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `guideVideoInfo:${guide.videoId}`;

    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        setInfo(JSON.parse(cached));
        return;
      }
    } catch {
      /* ignore -- fall through to a normal fetch */
    }

    setInfo(null);
    fetchVideoOEmbedInfo(guide.videoId).then((result) => {
      if (cancelled) return;
      setInfo(result);
      if (result.title) {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(result));
        } catch {
          /* storage full or unavailable -- fine, just skip caching this one */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [guide.videoId]);

  const displayTitle = info?.title || guide.label || `${operatorName} Guide`;

  return (
    <a
      href={`https://www.youtube.com/watch?v=${guide.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="video-card"
    >
      <div className="video-thumb-wrap">
        <Image src={`https://i.ytimg.com/vi/${guide.videoId}/mqdefault.jpg`} alt={displayTitle} fill sizes="384px" style={{ objectFit: 'cover' }} />
      </div>
      <div className="video-card-copy">
        <p className="video-card-title">{displayTitle}</p>
        {info?.author && <p className="video-card-meta">{info.author}</p>}
      </div>
    </a>
  );
}

export default function OperatorDetailPage({ chibis = {}, summons = [], epTrack, operator, appearances, skinObtainByLabel, synergyMatches, autoSynergyGroups, techniqueUnitIcons, techniqueBranchOperators, techniqueGroupOperators, techniqueRelatedOperators, forms, skillRanges, skillTimings, factionEmblem, artworkCredits, overviewRanges, voiceData, branchRelatedOperators = [], relatedByArtist = {}, relatedByVoiceActor = {}, materialOrder, dynamicArt = {} }: Props) {
  const music = useMusicPlayer();
  const contentUrl = useContentUrl();
  // The faction emblem is a CSS mask, which has no error event (lib/assets/assetRetry.ts).
  const emblemRef = useRef<HTMLSpanElement>(null);
  const emblem = useAssetUrl(factionEmblem ? contentUrl(factionEmblem) : '', emblemRef);
  const router = useRouter();

  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const mobile = window.matchMedia('(max-width: 900px)');
    let layoutWidth = window.innerWidth;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const setArtworkHeight = () => {
      if (!mobile.matches) {
        frame.style.removeProperty('--operator-mobile-art-height');
        return;
      }

      // Mobile browsers resize the visible viewport as their address bar hides
      // and returns. Capture the initial visible height as pixels so that normal
      // vertical scrolling cannot resize the artwork underneath the user's finger.
      const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
      frame.style.setProperty('--operator-mobile-art-height', `${Math.min(Math.round(visibleHeight * 0.7), 600)}px`);
    };

    const handleResize = () => {
      const nextWidth = window.innerWidth;
      // Height-only resizes are browser chrome or the on-screen keyboard. A real
      // width change means rotation, split-screen resizing, or a breakpoint change.
      if (Math.abs(nextWidth - layoutWidth) <= 8) return;
      layoutWidth = nextWidth;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setArtworkHeight, 120);
    };

    const handleBreakpoint = () => {
      layoutWidth = window.innerWidth;
      setArtworkHeight();
    };

    setArtworkHeight();
    window.addEventListener('resize', handleResize, { passive: true });
    mobile.addEventListener('change', handleBreakpoint);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      mobile.removeEventListener('change', handleBreakpoint);
      frame.style.removeProperty('--operator-mobile-art-height');
    };
  }, []);

  // --- Skin carousel state ---
  const [activeIndex, setActiveIndex] = useState(0);
  /** The outfit whose artwork is on screen: it follows activeIndex once that outfit's
   *  picture is in (below). */
  const [shownIndex, setShownIndex] = useState(0);
  /** An outfit whose control the reader is on: its artwork is fetched ahead (below). */
  const [warmIndex, setWarmIndex] = useState<number | null>(null);
  /** The outfits whose artwork is in the browser: fetched ahead, or shown before. */
  const [ready, setReady] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [rotating, setRotating] = useState(true);
  const [zooming, setZooming] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  // Client-side navigation to a different operator (e.g. via the header
  // search) re-renders this same page component instead of remounting
  // it, so the carousel state above would otherwise stay wherever it was
  // left on the previous operator's page. Reset it back to the first
  // skin whenever the operator itself changes.
  useEffect(() => {
    setActiveIndex(0);
    setShownIndex(0);
    setWarmIndex(null);
    setReady(new Set([0]));
    setRotating(true);
    setZooming(false);
    setInfoExpanded(false);
  }, [operator.name]);

  useEffect(() => {
    if (!rotating || appearances.length <= 1) return;
    const timer = setInterval(() => setActiveIndex(index => (index + 1) % appearances.length), 8000);
    return () => clearInterval(timer);
  }, [rotating, appearances.length, operator.name]);

  /* Only the outfit on screen is fetched at load (the picker's thumbnails are its 320px
     renditions, not the artwork). Another outfit's artwork is fetched just before it is
     shown, into a hidden copy inside the artwork's box (`warm`, which sizes nothing):
     when the reader points at, focuses or presses the control that would show it (an
     arrow, for its neighbour that way; a thumbnail or dot, for its own), and when it is
     picked (a click, a key, autoplay's turn). The picture on screen stays until the
     picked one is in, or for WARM_WAIT_MS at most, as a new src on any image does
     (lib/ui/imageArrival.ts), so the cross-fade never fades to an empty frame. */
  useEffect(() => {
    setReady((was) => (was.has(shownIndex) ? was : new Set(was).add(shownIndex)));
  }, [shownIndex]);
  useEffect(() => {
    if (activeIndex !== shownIndex && ready.has(activeIndex)) setShownIndex(activeIndex);
  }, [activeIndex, shownIndex, ready]);
  useEffect(() => {
    if (activeIndex === shownIndex) return;
    const timer = setTimeout(() => setShownIndex(activeIndex), WARM_WAIT_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, shownIndex]);

  function selectAppearance(index: number) {
    setRotating(false);
    setActiveIndex(index);
  }

  /** What the artwork, its caption, its zoom and its credits show: the outfit on screen. */
  const shownAppearance = appearances[shownIndex];
  const warmTarget = activeIndex !== shownIndex ? activeIndex : warmIndex !== null && warmIndex !== shownIndex ? warmIndex : null;
  const warmAppearance = warmTarget !== null ? appearances[warmTarget] : null;
  const [prevAppearance, setPrevAppearance] = useState<Appearance | null>(null);
  const prevAppearanceRef = useRef<Appearance | null>(null);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevAppearanceRef.current !== null && prevAppearanceRef.current.label !== shownAppearance?.label) {
      setPrevAppearance(prevAppearanceRef.current);
      if (imageTimeoutRef.current) clearTimeout(imageTimeoutRef.current);
      imageTimeoutRef.current = setTimeout(() => setPrevAppearance(null), 450);
    }
    prevAppearanceRef.current = shownAppearance || null;
    return () => {
      if (imageTimeoutRef.current) clearTimeout(imageTimeoutRef.current);
    };
  }, [shownAppearance]);

  // Each section keeps its controls mounted while only the selected one is visible.
  const availableSections: { key: SectionKey; label: string }[] = [];
  const skillList = useMemo(() => getSkillList(operator), [operator]);
  // Show the recorded mastery and priority beside every recommended skill tab.
  const showRecommendations = skillList.some(skill => skill.recommendation?.some(hasMasteryPriority));
  const skillCost = useMemo(() => getSkillCost(operator), [operator]);
  const priorityGuideGroups = useMemo(() => {
    type Row = { skillIndex: number; iconPath: string | null; entry: SkillRecommendationEntry };
    const rows: Row[] = [];
    skillList.forEach((s, i) => {
      const iconPath = getSkillIconPath(operator.name, s.name);
      (s.recommendation || []).filter(hasMasteryGuidance).forEach((entry) => {
        rows.push({ skillIndex: i, iconPath, entry });
      });
    });

    const priorityRank = (p: string | null) => (p === 'main' ? 0 : p === 'sub' ? 1 : 2);
    const byOrder = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.entry.order || '—';
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key)!.push(row);
    }
    for (const group of byOrder.values()) {
      group.sort((a, b) => priorityRank(a.entry.priority) - priorityRank(b.entry.priority));
    }
    // Groups themselves sorted by the order's parsed numeric value --
    // stable within a group per the sort above, and stable across groups
    // that happen to parse to the same number for the same reason.
    return Array.from(byOrder.entries())
      .sort(([orderA], [orderB]) => (parseInt(orderA, 10) || 0) - (parseInt(orderB, 10) || 0))
      .map(([order, entries]) => ({ order, entries }));
  }, [skillList, operator.name]);

  if (operator.stats?.phases.length) availableSections.push({ key: 'stats', label: 'Stats' });
  if (skillList.length > 0) availableSections.push({ key: 'skills', label: 'Skills' });
  if (operator.talents && operator.talents.length > 0) availableSections.push({ key: 'talents', label: 'Talents' });
  if (operator.modules?.some(module => module.type !== 'Original')) availableSections.push({ key: 'modules', label: 'Modules' });
  if (operator.synergies && operator.synergies.length > 0) availableSections.push({ key: 'synergy', label: 'Synergy' });
  else if (autoSynergyGroups && autoSynergyGroups.length > 0) availableSections.push({ key: 'synergy', label: 'Synergy' });
  if (operator.potential?.levels?.length > 0) availableSections.push({ key: 'potential', label: 'Potential' });
  if (operator.baseSkills && operator.baseSkills.length > 0) availableSections.push({ key: 'baseSkills', label: 'Base skills' });
  if (operator.characterInfo || operator.basicInfo || operator.physicalExam || operator.review?.official) {
    availableSections.push({ key: 'characterInfo', label: 'Profile' });
  }
  if (operator.files?.length) availableSections.push({ key: 'files', label: 'Files' });
  if (voiceData?.lines.length) availableSections.push({ key: 'voiceLines', label: 'Voice lines' });
  if (operator.guides?.length) availableSections.push({ key: 'guides', label: 'Guides' });
  if (priorityGuideGroups.length) availableSections.push({ key: 'mastery', label: 'Mastery' });
  if (operator.promotion?.length) availableSections.push({ key: 'promotion', label: 'Promotion' });
  const sectionOrder: SectionKey[] = ['skills', 'stats', 'talents', 'mastery', 'modules', 'promotion', 'potential', 'baseSkills', 'synergy', 'characterInfo', 'files', 'voiceLines', 'guides'];
  availableSections.sort((a, b) => sectionOrder.indexOf(a.key) - sectionOrder.indexOf(b.key));
  const [activeSection, setActiveSection] = useState<OperatorSection>('overview');
  const hasSection = (key: OperatorSection) => availableSections.some(section => section.key === key);
  const sectionVisible = hasSection;
  const navigationRef = useRef<HTMLDivElement>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  function jumpToSection(view: string, focusPanel = false) {
    const aliases: Record<string, string> = { gameplay: 'skills', upgrades: 'skills', profile: 'characterInfo', appearance: 'artwork' };
    const requested = aliases[view] ?? view;
    const key = requested === 'artwork' ? 'overview'
      : requested === 'mastery' && !hasSection('mastery') ? 'skills' : requested;
    // A hash the page has no name for, or a section this operator does not have, changes nothing.
    if (!isOperatorSection(key) || (key !== 'overview' && !hasSection(key))) return;
    requestAnimationFrame(() => {
      const panel = areaRef.current;
      const target = document.getElementById(`operator-${requested === 'artwork' ? 'artwork' : key}`);
      if (!panel || !target) return;
      setActiveSection(requested === 'artwork' && window.matchMedia('(max-width: 900px)').matches ? 'artwork' : key);
      if (requested === 'artwork') {
        panel.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      } else if (getComputedStyle(panel).overflowY === 'auto') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        panel.scrollTo({ top: panel.scrollTop + target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12, behavior: 'instant' as ScrollBehavior });
      } else {
        const navHeight = navigationRef.current?.getBoundingClientRect().height ?? 0;
        const siteNavHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navHeight - siteNavHeight - 12, behavior: 'instant' as ScrollBehavior });
      }
      if (focusPanel) target.focus({ preventScroll: true });
    });
  }

  function selectView(view: string, focusPanel = false) {
    jumpToSection(view, focusPanel);
    if (window.location.hash !== `#${view}`) {
      void router.push(`${router.asPath.split('#')[0]}#${view}`, undefined, { shallow: true, scroll: false }).catch(error => {
        // A later section selection may supersede this shallow navigation.
        if (!error.cancelled) throw error;
      });
    }
  }

  const sectionGroups = [
    { label: 'Overview and abilities', keys: ['overview', 'skills', 'stats', 'talents'] },
    { label: 'Upgrades', keys: ['mastery', 'modules', 'promotion', 'potential'] },
    { label: 'More operator information', keys: ['baseSkills', 'synergy', 'characterInfo', 'files', 'voiceLines', 'guides'] },
  ] as const;

  useEffect(() => {
    const header = navigationRef.current;
    const details = header?.parentElement;
    if (!header || !details) return;
    const updateHeaderHeight = () => {
      details.style.setProperty('--operator-panel-header-h', `${header.getBoundingClientRect().height}px`);
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
      details.style.removeProperty('--operator-panel-header-h');
    };
  }, [operator.name]);

  useEffect(() => {
    const panel = areaRef.current;
    if (!panel) return;
    panel.scrollTop = 0;
    if (getComputedStyle(panel).overflowY === 'auto') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const syncHash = () => jumpToSection(window.location.hash.slice(1) || 'overview');
    if (window.location.hash) syncHash();
    else setActiveSection('overview');
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    router.events.on('hashChangeComplete', syncHash);

    // Scrolling only updates the highlight. It never changes history or moves focus.
    let frame = 0;
    const updateSection = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const internalScroll = getComputedStyle(panel).overflowY === 'auto';
        const artwork = document.getElementById('operator-artwork');
        const siteNavHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
        if (!internalScroll && window.matchMedia('(max-width: 900px)').matches
          && artwork && artwork.getBoundingClientRect().bottom > siteNavHeight + 16) {
          setActiveSection('artwork');
          return;
        }
        const edge = (internalScroll ? panel.getBoundingClientRect().top
          : navigationRef.current?.getBoundingClientRect().bottom ?? 52) + 16;
        const sections = Array.from(panel.querySelectorAll<HTMLElement>('[data-operator-section]'));
        const scrollRoot = internalScroll ? panel : document.documentElement;
        const viewportHeight = internalScroll ? panel.clientHeight : window.innerHeight;
        const scrollTop = internalScroll ? panel.scrollTop : window.scrollY;
        const atEnd = scrollRoot.scrollHeight > viewportHeight && scrollRoot.scrollHeight - viewportHeight - scrollTop <= 2;
        const current = atEnd ? sections[sections.length - 1]
          : sections.filter(section => section.getBoundingClientRect().top <= edge).pop() ?? sections[0];
        const section = current?.dataset.operatorSection;
        if (section && isOperatorSection(section)) setActiveSection(section);
      });
    };
    panel.addEventListener('scroll', updateSection, { passive: true });
    window.addEventListener('scroll', updateSection, { passive: true });
    window.addEventListener('resize', updateSection);
    const observer = new ResizeObserver(updateSection);
    if (panel.firstElementChild) observer.observe(panel.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel.removeEventListener('scroll', updateSection);
      window.removeEventListener('scroll', updateSection);
      window.removeEventListener('resize', updateSection);
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
      router.events.off('hashChangeComplete', syncHash);
    };
  // The section catalogue is derived from this operator and is otherwise stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator.name, router.events]);

  // Skill effects, timings and upgrade costs share one selection.
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const activeSkill = skillList[activeSkillIndex];
  /* This operator's skill ranges, keyed by slot as a string, from getStaticProps. Only
     the skills that change the range are in it, so a miss means "no change". */
  const skillRange = skillRanges?.[String(activeSkillIndex + 1)] ?? null;

  const skillSteps = useMemo(() => {
    if (!activeSkill) return [];
    return [...activeSkill.levels].sort((a, b) => {
      const av = a.mastery != null ? 7 + a.mastery : a.level || 0;
      const bv = b.mastery != null ? 7 + b.mastery : b.level || 0;
      return av - bv;
    });
  }, [activeSkill]);
  // Keep the chosen level across skills; operators without Mastery stop at Lv7.
  const [preferredStepIndex, setActiveStepIndex] = useState(9);
  const activeStepIndex = Math.min(preferredStepIndex, Math.max(0, skillSteps.length - 1));
  const [showTotal, setShowTotal] = useState(false);
  const [showModuleTotal, setShowModuleTotal] = useState(false);
  const activeStep = skillSteps[activeStepIndex];
  const timingIndex = activeStep?.mastery != null ? 6 + activeStep.mastery : (activeStep?.level ?? 1) - 1;
  const skillTiming = getSkillTiming(activeStep, activeSkill, skillTimings[activeSkillIndex]?.[timingIndex]);

  /* What the slider is currently on, for the grid's tooltip: "M1", or "Level 3". */
  const activeStepLabel = activeStep
    ? (activeStep.mastery != null ? `M${activeStep.mastery}` : `Level ${activeStep.level}`)
    : null;

  /**
   * The range this skill has AT THE LEVEL BEING SHOWN, which is not always its last
   * one: Mayer's Bionic Device covers only her own tile until M1, and Swire's Command
   * and Dispatch widens at plain level 7. The page used to draw the final range beside
   * every level's description, so those four skills read wrong for the first seven.
   *
   * Found by the level's own position rather than by the slider's -- 0-6 are levels 1-7
   * and 7-9 are M1-M3, which is how the build script indexes levelRangeIds. The slider
   * index would be the same number today, but only because our record happens to list
   * the levels in that order and hold as many of them as the gamedata does; the level's
   * own number says what it means, and build-skill-ranges.mjs fails the build if the two
   * sides ever disagree about how many there are.
   */
  const activeSkillRange = useMemo(() => {
    if (!skillRange || !activeStep) return null;
    const idx = activeStep.mastery != null ? 6 + activeStep.mastery : (activeStep.level ?? 1) - 1;
    const ids = skillRange.levelRangeIds;
    if (!ids.length) return null;
    const id = ids[Math.min(Math.max(idx, 0), ids.length - 1)];
    return (id && skillRange.grids[id]) || null;
  }, [skillRange, activeStep]);

  function costForStep(): CostGroup | null {
    if (!activeStep) return null;

    if (!showTotal) {
      // Separate view: just this step's own cost.
      if (activeStep.mastery != null) {
        if (activeStep.mastery === 1) return activeSkill?.cost?.m1 || null;
        if (activeStep.mastery === 2) return activeSkill?.cost?.m2 || null;
        if (activeStep.mastery === 3) return activeSkill?.cost?.m3 || null;
        return null;
      }
      if (activeStep.level != null && skillCost) {
        return skillCost[String(activeStep.level)] || null;
      }
      return null;
    }

    // Cumulative view: sum every step from level 2 up through the
    // currently viewed step (levels 2-7 are shared skillCost, mastery
    // 1-3 are this skill's own cost).
    const stepsUpToActive = skillSteps.slice(0, activeStepIndex + 1);
    const groups: (CostGroup | null | undefined)[] = [];
    for (const step of stepsUpToActive) {
      if (step.mastery != null) {
        if (step.mastery === 1) groups.push(activeSkill?.cost?.m1);
        else if (step.mastery === 2) groups.push(activeSkill?.cost?.m2);
        else if (step.mastery === 3) groups.push(activeSkill?.cost?.m3);
      } else if (step.level != null && step.level >= 2 && skillCost) {
        groups.push(skillCost[String(step.level)]);
      }
    }
    return sumCostGroups(groups);
  }

  // Module selection and cost scope.
  const modules = (operator.modules || []).filter((m) => m.type !== 'Original');
  const [activeModuleIndex, setActiveModuleIndex] = useState<number | null>(modules.length > 0 ? 0 : null);
  const [activeModuleStage, setActiveModuleStage] = useState(0);
  const [showMission, setShowMission] = useState(false);

  useEffect(() => {
    setActiveSkillIndex(0);
    setActiveStepIndex(9);
    setActiveModuleIndex(operator.modules?.some(module => module.type !== 'Original') ? 0 : null);
    setActiveModuleStage(0);
    setShowMission(false);
  }, [operator.name, operator.modules]);

  function selectModule(i: number) {
    setActiveModuleIndex(i);
    setActiveModuleStage(0);
    setShowMission(false);
  }

  const activeModule = activeModuleIndex != null ? modules[activeModuleIndex] : null;
  const activeStage = activeModule?.stages[activeModuleStage];

  function costForModuleStage(): CostGroup | null {
    if (!activeStage) return null;
    if (!showModuleTotal) return activeStage.cost || null;
    const stagesUpToActive = activeModule!.stages.slice(0, activeModuleStage + 1);
    return sumCostGroups(stagesUpToActive.map((s) => s.cost));
  }

  const [releaseClock, setReleaseClock] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setReleaseClock(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const releaseLabel = releaseClock === null ? null : operatorReleaseLabel(operator, releaseClock);

  const welfareInfo = getWelfareInfo(operator.howToObtain);
  const howToObtainDisplay =
    typeof operator.howToObtain === 'string'
      ? operator.howToObtain
      : operator.howToObtain
      ? Object.entries(operator.howToObtain)
          .filter(([k, v]) => v === 'Yes' || (k === 'Welfare' && typeof v === 'object' && v !== null))
          .map(([k]) => (k === 'Welfare' && welfareInfo ? `Welfare (${welfareInfo['Unlock Type']} \u2014 ${welfareInfo['Unlock Location']})` : k))
          .join(', ') || 'Unknown'
      : 'Unknown';
  // Every promotion's trait where it changes (Pudding jumps to 3 enemies, 4 from Elite 2).
  const traitLines = traitPhases(operator.trait);


  return (
    <>
      {/* The frame is the viewport under the nav: the header, then the workspace
          (artwork | information) filling what is left, so on a desktop the page itself
          never scrolls and the information panel scrolls inside it. */}
      <div className={pageStyles.frame} ref={frameRef}>
      <PageHeader slim eyebrow={<>Rhodes Island // <Link prefetch={false} href="/operators">Operator roster</Link></>}
        title={operator.name} actions={<OperatorSearch section={activeSection} />} />

      <main className={`${pageStyles.page}${infoExpanded ? ` ${pageStyles.infoExpanded}` : ''}`} onClick={(event) => {
        const link = (event.target as HTMLElement).closest('a[href^="#"]');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        selectView(link.getAttribute('href')!.slice(1), true);
      }}>
          <section id="operator-artwork" tabIndex={-1} aria-label="Operator artwork" className={pageStyles.gallery}>
            <div className="op-carousel-main">
              {factionEmblem && <span ref={emblemRef} aria-hidden="true" className={pageStyles.artworkEmblem} style={{ maskImage: cssUrl(emblem), WebkitMaskImage: cssUrl(emblem) }} />}
              {warmAppearance?.fullPath && (
                <div key={`warm-img-${warmAppearance.label}`} className="op-carousel-main-img op-carousel-warm" aria-hidden="true">
                  <ResponsiveSkinArtwork src={warmAppearance.fullPath} alt="" fill sizes={ARTWORK_SIZES}
                    onLoad={() => setReady((was) => (was.has(warmTarget!) ? was : new Set(was).add(warmTarget!)))} />
                </div>
              )}
              {prevAppearance?.fullPath && (
                <div key={`prev-img-${prevAppearance.label}`} className="op-carousel-main-img op-carousel-img-exit">
                  <ResponsiveSkinArtwork src={prevAppearance.fullPath} alt={prevAppearance.label} fill sizes={ARTWORK_SIZES} />
                </div>
              )}
              {shownAppearance?.fullPath ? (
                <button
                  type="button"
                  className="op-carousel-main-btn"
                  aria-label={`Enlarge ${operator.name} artwork: ${shownAppearance?.label}`}
                  onClick={() => {
                    setRotating(false);
                    setZooming(true);
                  }}
                >
                  <div key={`current-img-${shownAppearance.label}`} className="op-carousel-main-img op-carousel-img-enter">
                    {/* The page's hero (its LCP): fetched at once and first. */}
                    <ResponsiveSkinArtwork src={shownAppearance.fullPath} alt={shownAppearance.label} fill priority sizes={ARTWORK_SIZES} />
                  </div>
                </button>
              ) : (
                <div className="op-carousel-main-empty">No large image available</div>
              )}
            </div>

            <OperatorChibi key={operator.name} onOpen={() => setRotating(false)} models={chibis[shownAppearance?.label ?? ''] ?? null} label={`${operator.name} — ${shownAppearance?.label ?? ''}`} />
            <div className={pageStyles.artworkCaptionRow}>
              <OperatorArtworkCaption appearances={appearances} activeIndex={shownIndex} prices={skinObtainByLabel} />
              {epTrack && <button type="button" className="ghost btn-sm" title={epTrack.title} disabled={music.excludeCopyrighted && epTrack.copyright} onClick={() => music.playFirst(epTrack.id)}>Play EP</button>}
            </div>
            <OperatorAppearancePicker key={operator.name} appearances={appearances} activeIndex={activeIndex}
              onSelect={selectAppearance} onWarm={setWarmIndex} rotating={rotating} onRotationChange={setRotating} />


          </section>

          <div className={pageStyles.splitRail}>
            <button type="button" aria-pressed={infoExpanded}
              aria-label={infoExpanded ? 'Restore artwork and information balance' : 'Widen operator information'}
              title={infoExpanded ? 'Restore panel width' : 'Widen information panel'}
              onClick={() => setInfoExpanded(value => !value)}>
              <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={infoExpanded ? 'M7 4l6 6-6 6' : 'M13 4l-6 6 6 6'} />
              </svg>
            </button>
          </div>

          <div className={pageStyles.details}>
          <div ref={navigationRef} className={pageStyles.panelHeader}>
          <div className={pageStyles.hero}>
            <div className={pageStyles.identity}>
            <div className="op-header-flex">
              <div className="op-header-text">
                <div className="op-name-row">
                  <div className="op-sticky-meta">
                    {operator.rarity ? <Rarity n={rarityLevel(operator.rarity)} format="stars" /> : null}
                    {getClassIconPath(operator.class) && (
                      <span className={pageStyles.classLabel}><OperatorGameIcon src={getClassIconPath(operator.class)!} label={operator.class || 'Class'} size={20} /><span>{operator.class}</span></span>
                    )}
                    {getBranchIconPath(operator.branch) && (
                      <OperatorRelationPopover label={operator.branch || 'Branch'} title={`Other ${operator.branch} operators`} operators={branchRelatedOperators} section={activeSection}>
                        <span className={pageStyles.classLabel}><OperatorGameIcon src={getBranchIconPath(operator.branch)!} label={operator.branch || 'Branch'} size={20} /><span>{operator.branch}</span></span>
                      </OperatorRelationPopover>
                    )}
                  </div>
                  <nav className={pageStyles.sectionMenu} aria-label="Operator sections">
                    <StyledSelect label="Jump to section" align="end" value={activeSection}
                      options={[
                        { value: 'artwork', label: 'Artwork' },
                        ...sectionGroups.flatMap(group => group.keys.flatMap(key => {
                          const section = key === 'overview' ? { key, label: 'Overview' } : availableSections.find(item => item.key === key);
                          return section ? [{ value: section.key, label: section.label, group: group.label }] : [];
                        })),
                      ]}
                      onChange={view => selectView(view, true)} />
                  </nav>
                </div>

                {/* Amiya's class forms. Real navigations rather than a tab, because each
                    form is its own page with its own skills, talents and modules -- so a
                    reader can link someone straight to the Guard. Every form is a link,
                    the current one too, marked by aria-current (below). */}
                {forms && forms.length > 1 && (
                  <nav className="tabs op-form-switch" aria-label={`${operator.name.replace(/ \(.*\)$/, '')} class forms`}>
                    <span className="visually-hidden">Class</span>
                    {forms.map((f) => {
                      const isCurrent = f.name === operator.name;
                      const icon = getClassIconPath(FORM_CLASS[f.label] ?? f.label);
                      const inner = (
                        <>
                          {icon && <OperatorGameIcon src={icon} label={f.label} size={26} />}
                          <span className="visually-hidden">{f.label}</span>
                        </>
                      );
                      /* All three stay links, with aria-current marking the one you are
                         on: the site's tab look on links (.tabs / .tab), as the Terminal
                         bar and the game switcher use it -- teal and underlined when
                         current. A self-link in a nav is the ordinary pattern for this. Each
                         form opens at the section the reader is on, as any move from one
                         operator to another does (operatorHref). */
                      return (
                        <Link
                          key={f.name}
                          prefetch={false}
                          href={operatorHref(f.name, activeSection)}
                          className="tab"
                          aria-current={isCurrent ? 'page' : undefined}
                        >
                          {inner}
                        </Link>
                      );
                    })}
                  </nav>
                )}
              </div>

            </div>

            </div>
          </div>
          </div>
          <div id="operator-detail-panel" ref={areaRef} className={pageStyles.area}>
            <div className={pageStyles.content}>
            {(
              <section id="operator-overview" data-operator-section="overview" tabIndex={-1} className={`op-section ${pageStyles.overview}`} aria-label="Overview">
                <h2>Overview</h2>
                <div>
                  {operator.review?.official && <p className={pageStyles.review}>{highlightStats(operator.review.official)}</p>}
                  {overviewRanges.length > 0 && <div className={pageStyles.range}><OperatorAttackRange key={operator.internalName ?? operator.name} ranges={overviewRanges} /></div>}
                  {traitLines.length > 0 && <p className={pageStyles.trait}><OperatorTraitLines lines={traitLines} highlight /></p>}
                  <div className="op-sticky-meta op-sticky-tag-row">
                    {operator.position && <span className="op-tag-pill op-tag-pill-position">{operator.position}</span>}
                    {operator.tags?.map(tag => <span className="op-tag-pill" key={tag}>{tag}</span>)}
                  </div>
                  {howToObtainDisplay !== 'Unknown' && <p className={pageStyles.obtain}>{howToObtainDisplay}</p>}
                  <OperatorCredits
                    artwork={artworkCredits[shownAppearance?.label ?? 'Base'] ?? artworkCredits.Base}
                    variants={Object.values(artworkCredits)}
                    voicePacks={voiceData?.packs}
                    relatedByArtist={relatedByArtist}
                    relatedByVoiceActor={relatedByVoiceActor}
                  />
                </div>
              </section>
            )}
            {sectionVisible('skills') && (
              <section id="operator-skills" data-operator-section="skills" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <div className={pageStyles.skillHeading}>
                  <h2>Skills</h2>
                  {priorityGuideGroups.length > 0 && (
                    <a className="ghost btn-sm" href="#mastery" aria-label="Mastery priority guide">
                      <span><span className={pageStyles.masteryGuidePrefix}>Mastery </span>priority guide ↓</span>
                    </a>
                  )}
                </div>
                {/* The site's tabs, each with the skill's icon: they were 56x62 icon
                    tiles in a column beside the title, a fourth tab look. */}
                <Tabs
                  label="Skill"
                  id="operator-skill"
                  className={`op-skill-tabs ${pageStyles.skillTabs}`}
                  value={activeSkillIndex}
                  onChange={setActiveSkillIndex}
                  options={skillList.map((s, i) => {
                    const iconPath = getSkillIconPath(operator.name, s.name);
                    return {
                      value: i,
                      label: <span className={pageStyles.skillTabLabel}>
                        <span className={pageStyles.skillTabLong}>Skill {i + 1}</span>
                        <span className={pageStyles.skillTabShort} aria-hidden="true">S{i + 1}</span>
                        {showRecommendations && <RecommendationBadge entries={s.recommendation} />}
                      </span>,
                      ariaLabel: `Skill ${i + 1}: ${s.name || `Skill ${i + 1}`}${showRecommendations ? (s.recommendation ?? []).filter(hasMasteryPriority).map(e => `, ${[e.mastery?.toUpperCase(), e.order].filter(Boolean).join(' · ')}`).join('') : ''}`,
                      title: s.name || `Skill ${i + 1}`,
                      icon: iconPath ? <Image src={iconPath} alt="" width={40} height={40} /> : undefined,
                    };
                  })}
                />

                {activeSkill && (
                  <div {...tabPanelProps('operator-skill', activeSkillIndex)}>
                    <h3 className={`entity-title entity-title-sm ${pageStyles.selectedSkill}`}>
                      {/* Overlapping variants reserve the tallest header at this width,
                          including wrapped names. */}
                      {skillList.map((skill, index) => (
                        <span key={index} className={pageStyles.skillTitleVariant}
                          aria-hidden={index !== activeSkillIndex}
                          style={{ visibility: index === activeSkillIndex ? 'visible' : 'hidden' }}>
                          <span>{skill.name || `Skill ${index + 1}`}</span>
                        </span>
                      ))}
                    </h3>


                    <div className={pageStyles.skillLevelControl}>
                      <label htmlFor="operator-skill-level">Skill level</label>
                      <span className={pageStyles.skillLevelValue} aria-hidden="true">
                        {activeStep?.mastery != null && <OperatorGameIcon label={`M${activeStep.mastery}`} size={24} color />}
                        <span>{activeStep?.mastery != null ? `M${activeStep.mastery}` : `Lv${activeStep?.level ?? '—'}`}</span>
                      </span>
                      <input id="operator-skill-level" type="range" min={0} max={Math.max(0, skillSteps.length - 1)} step={1}
                        value={activeStepIndex} aria-valuetext={activeStepLabel ?? undefined}
                        onChange={event => setActiveStepIndex(Number(event.target.value))} />
                    </div>

                    {activeStep && (
                      <div className="op-skill-step-detail">
                        <dl className={pageStyles.skillMetrics}>
                          <div className={/^auto\b/i.test(activeSkill.recoveryType || '') ? pageStyles.skillMetricAuto : /^(?:offensive|defensive)\b/i.test(activeSkill.recoveryType || '') ? pageStyles.skillMetricAmber : undefined}><dt>SP recovery</dt><dd>{activeSkill.recoveryType?.replace(/ Recovery$/i, '') || '—'}</dd></div>
                          <div className={/^auto\b/i.test(activeSkill.activationType || '') ? pageStyles.skillMetricAuto : /^manual\b/i.test(activeSkill.activationType || '') ? pageStyles.skillMetricAmber : undefined}><dt>Activation</dt><dd>{activeSkill.activationType || '—'}</dd></div>
                          <div className={pageStyles.skillMetricSp}><dt>Initial SP</dt><dd>{activeStep.initialSp ?? '—'}</dd></div>
                          <div className={pageStyles.skillMetricSp}><dt>SP cost</dt><dd>{activeStep.spCost ?? '—'}</dd></div>
                          <div><dt>{skillTiming.label}</dt><dd>{skillTiming.value}</dd></div>
                        </dl>
                        <p>{highlightStats(activeStep.description)}</p>
                        {skillRange && activeSkillRange && (
                          <div className="op-skill-range">
                            <span className="op-skill-range-label">Range while active</span>
                            <div className="op-skill-range-pair">
                              {skillRange.baseRange && (
                                <>
                                  <RangeGridBox range={skillRange.baseRange} label="Normal attack range" />
                                  <span className="op-skill-range-arrow" aria-hidden="true">→</span>
                                </>
                              )}
                              {/* The range at the level the slider is on, not the skill's
                                  final one. Four skills differ between the two. */}
                              <RangeGridBox
                                range={activeSkillRange}
                                label={`Attack range while this skill is active${activeStepLabel ? ` at ${activeStepLabel}` : ''}`}
                              />
                            </div>
                            {/* Only for the four skills whose range is not the same at every
                                level. Named rather than called a mastery: three step up at M1
                                but Swire's Command and Dispatch widens at plain level 7, so
                                "at mastery" was wrong for her. */}
                            {skillRange.changesAt.length > 0 && (
                              <span className="op-skill-range-note">
                                {`Changes at ${formatLevelList(skillRange.changesAt)}`}
                              </span>
                            )}
                          </div>
                        )}

                        {(
                          <div className={pageStyles.costs}>
                            <label htmlFor="skill-cost-scope">Material costs</label>
                            <StyledSelect id="skill-cost-scope" align="end" label="Skill material costs" className={pageStyles.costSelect}
                              value={showTotal ? 'total' : 'step'} onChange={value => setShowTotal(value === 'total')}
                              options={[{ value: 'step', label: 'Selected upgrade only' }, { value: 'total', label: `All skill levels up to ${activeStepLabel}` }]} />
                            <CostRow cost={costForStep()} order={materialOrder} />
                          </div>
                        )}


                        {(() => {
                          // The record's own techniques and the rules its text matches, each once.
                          const allTechs = activeSkill ? skillTechniques(operator, activeSkill) : [];
                          return (
                            allTechs.length > 0 && (
                              <TechniqueList
                                section="skills"
                                techniques={allTechs}
                                techniqueUnitIcons={techniqueUnitIcons}
                                techniqueBranchOperators={techniqueBranchOperators}
                                techniqueGroupOperators={techniqueGroupOperators}
                                techniqueRelatedOperators={techniqueRelatedOperators}
                              />
                            )
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {operator.stats?.phases.length ? (
              <div id="operator-stats" data-operator-section="stats" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <OperatorStatsPanel key={`stats-${operator.name}`} stats={operator.stats} modules={operator.modules} />
                {summons.length > 0 && <section className="op-section" aria-label="Summon stats"><h2>Summon stats</h2><OperatorSummons key={operator.name} summons={summons} /></section>}
              </div>
            ) : null}

            {sectionVisible('talents') && operator.talents && (
              <section id="operator-talents" data-operator-section="talents" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <OperatorTalents key={operator.name} talents={operator.talents}
                  elites={operator.stats?.phases.map(phase => phase.elite) ?? []}
                  renderDetails={(talent, unlocked) => {
                    if (operator.internalName === 'char_1039_thorn2' && talent.name === 'El Alcance de la Visión') return <LodestarTalentDemo unlocked={unlocked} />;
                    // The record's own techniques and the rules its text matches, each once.
                    const allTechs = talentTechniques(operator, talent);
                    return allTechs.length > 0 ? <TechniqueList summary="Talent details" section="talents" techniques={allTechs} techniqueUnitIcons={techniqueUnitIcons} techniqueBranchOperators={techniqueBranchOperators} techniqueGroupOperators={techniqueGroupOperators} techniqueRelatedOperators={techniqueRelatedOperators} /> : null;
                  }} />
              </section>
            )}

            {priorityGuideGroups.length > 0 && (
              <section id="operator-mastery" data-operator-section="mastery" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Mastery priorities</h2>
                <div className={pageStyles.masteryGrid}>
                  {priorityGuideGroups.flatMap(group => group.entries.map((row, index) => (
                    <article key={`${group.order}-${row.skillIndex}-${index}`} className={pageStyles.masteryCard}>
                      <div className={pageStyles.masteryHeading}>
                        <span className={pageStyles.priorityOrder}>{group.order}</span>
                        <a href="#skills" onClick={() => setActiveSkillIndex(row.skillIndex)} className={pageStyles.masterySkill} title={skillList[row.skillIndex].name || undefined}>
                          {row.iconPath && <Image src={row.iconPath} alt="" width={28} height={28} />}
                          <span>Skill {row.skillIndex + 1}</span>
                        </a>
                        {row.entry.mastery && <OperatorGameIcon label={row.entry.mastery.toUpperCase()} color />}
                        <span className={pageStyles.priorityKind}>{row.entry.priority === 'main' ? 'Main' : row.entry.priority === 'sub' ? 'Sub' : ''}</span>
                      </div>
                      {row.entry.explanation && <p>{row.entry.explanation}</p>}
                    </article>
                  )))}
                </div>
              </section>
            )}

            {/* ---- Modules ---- */}
            {sectionVisible('modules') && (
              <section id="operator-modules" data-operator-section="modules" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Modules</h2>
                <div className="op-module-list" role="group" aria-label="Modules">
                  {modules.map((m, i) => {
                    const isActive = i === activeModuleIndex;
                    const shortName = m.name?.includes(':') ? m.name.split(':')[0].trim() : m.name;
                    return (
                      <button
                        type="button"
                        key={i}
                        className="filter-chip op-module-card"
                        aria-pressed={isActive}
                        onClick={() => selectModule(i)}
                      >
                        {shortName || m.type}
                      </button>
                    );
                  })}
                </div>

                {activeModule && (
                  <div className="op-module-detail">
                    <h3>{activeModule.name || activeModule.type}</h3>
                    {activeModule.mission && (
                      <div className="op-module-mission">
                        <button type="button" className="ghost" aria-expanded={showMission} onClick={() => setShowMission((s) => !s)}>
                          Unlock requirements
                        </button>
                        {showMission &&
                          Object.values(activeModule.mission)
                            .filter((v): v is string => !!v)
                            .map((req, i) => (
                              <p key={i} className="hint">
                                • {req}
                              </p>
                            ))}
                      </div>
                    )}

                    {activeModule.stages.length > 0 && (
                      <>
                        <SegmentedControl label="Module stage" className="op-module-stage-buttons"
                          value={activeModuleStage} onChange={setActiveModuleStage}
                          options={activeModule.stages.map((_, i) => ({ value: i, label: i + 1, ariaLabel: `Module stage ${i + 1}` }))} />

                        {activeStage && (
                          <div className="op-module-stage-detail">
                            <p>
                              <OperatorStatModifiers text={activeStage.attributesIncreased} />
                            </p>
                            {getModuleStageEffects(activeModule, activeModuleStage).map(effect => (
                              <p key={effect.label}>
                                <b>{effect.label}:</b> {highlightStats(effect.text)}
                              </p>
                            ))}
                            <div className={pageStyles.costs}>
                              <label htmlFor="module-cost-scope">Material costs</label>
                              <StyledSelect id="module-cost-scope" align="end" label="Module material costs" className={pageStyles.costSelect}
                                value={showModuleTotal ? 'total' : 'step'} onChange={value => setShowModuleTotal(value === 'total')}
                                options={[{ value: 'step', label: 'Selected stage only' }, { value: 'total', label: `All stages up to stage ${activeModuleStage + 1}` }]} />
                              <CostRow cost={costForModuleStage()} order={materialOrder} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {sectionVisible('promotion') && (
              <section id="operator-promotion" data-operator-section="promotion" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Promotion</h2>
                {operator.promotion.map((tier, index) => (
                  <div key={index} className={pageStyles.promotionTier}>
                    <h3><OperatorGameIcon label={tier.tier} size={36} /></h3>
                    {tier.prerequisite && <p><OperatorStatModifiers text={tier.prerequisite} /></p>}
                    {tier.upgrades.length > 0 && <ul>{tier.upgrades.map((upgrade, index) => <li key={index}>{upgrade}</li>)}</ul>}
                    <CostRow cost={tier.cost} order={materialOrder} promotion />
                  </div>
                ))}
              </section>
            )}

            {/* ---- Potential ---- */}
            {sectionVisible('potential') && (
              <section id="operator-potential" data-operator-section="potential" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Potential</h2>
                {operator.potential.levels.map((p, i) => {
                  const iconPath = p.level >= 2 && p.level <= 6 ? getEssentialIconPath(`Potential ${p.level}`) : null;
                  return (
                    <p key={i} className="op-potential-row">
                      {iconPath ? (
                        <OperatorGameIcon label={`Potential ${p.level}`} size={36} color />
                      ) : (
                        <b>Potential {p.level}:</b>
                      )}
                      <span>{highlightStats(p.benefit)}</span>
                    </p>
                  );
                })}
              </section>
            )}

            {/* ---- Base Skills ---- */}
            {sectionVisible('baseSkills') && operator.baseSkills && (
              <section id="operator-baseSkills" data-operator-section="baseSkills" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Base skills</h2>
                <div className="op-base-skill-list">
                  {operator.baseSkills.map((bs, i) => {
                    const iconPath = getBaseSkillIconPath(operator.name, bs);
                    return (
                      <div key={i} className="op-base-skill-card">
                        <div className="op-base-skill-header">
                          {iconPath && <Image src={iconPath} alt="" width={32} height={32} />}
                          <div>
                            <b>{baseSkillDisplayName(bs)}</b>
                            <p className="hint op-base-skill-meta">
                              {bs.facility}
                              {bs.eliteLevel && (
<OperatorGameIcon label={bs.eliteLevel} size={24} />
                              )}
                            </p>
                          </div>
                        </div>
                        <p>{highlightStats(bs.description)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---- Synergy ---- */}
            {sectionVisible('synergy') && (
              <section id="operator-synergy" data-operator-section="synergy" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Synergy</h2>
                {operator.synergies && (
                <div className="op-synergy-list">
                  {operator.synergies.map((entry, i) => {
                    if (entry.type === 'category') {
                      return (
                        <div key={i} className="op-synergy-entry">
                          <div className="op-synergy-header">
                            <span className="op-synergy-value">{entry.values.join(', ')}</span>
                          </div>
                          {entry.description && <p className="op-synergy-description">{entry.description}</p>}
                          <p className="hint">Category-based matching isn&apos;t implemented yet.</p>
                        </div>
                      );
                    }
                    const matches = synergyMatches[i] || [];
                    return (
                      <div key={i} className="op-synergy-entry">
                        <div className="op-synergy-header">
                          {entry.values.map((v, vi) => {
                            const iconPath = entry.type === 'branch' ? getBranchIconPath(v) : entry.type === 'faction' ? getFactionIconPath(v) : null;
                            return (
                              <span key={vi} className="op-synergy-value">
                                {/* White art: a mask in the line's ink, or white on white in the light theme. */}
                                {iconPath && <OperatorGameIcon src={iconPath} label={v} size={28} />}
                                <span>{v}</span>
                              </span>
                            );
                          })}
                        </div>
                        {entry.description && <p className="op-synergy-description">{entry.description}</p>}
                        {matches.length > 0 && (
                          <div className="op-synergy-operators">
                            {matches.map((m) => (
                              <Link prefetch={false}
                                key={m.name}
                                href={operatorHref(m.name, 'synergy')}
                                className="op-synergy-operator"
                                aria-label={m.name}
                              >
                                <Image src={getOperatorIconPath(m as Operator)} alt={m.name} width={40} height={40} />
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}

                {/* Auto-detected faction/class synergies -- separate from the
                    manually-authored list above. Shows every operator whose
                    OWN faction/class matches one this operator belongs to,
                    where at least one operator's skill/talent genuinely
                    grants a buff to that faction/class. Contributors (with
                    their skill/talent badge) come first, then plain members,
                    capped at 10 total with no pagination. */}
                {autoSynergyGroups && autoSynergyGroups.length > 0 && (
                  <div className="op-synergy-list">
                    {autoSynergyGroups.map((group) => (
                      <div key={`${group.type}-${group.name}`} className="op-synergy-entry">
                        <div className="op-synergy-header">
                          <span className="op-synergy-value">
                            <span>
                              {group.name} ({group.type})
                            </span>
                          </span>
                        </div>
                        <div className="op-synergy-operators">
                          {group.entries.map((e) => (
                            <Link prefetch={false}
                              key={e.operatorName}
                              href={operatorHref(e.operatorName, 'synergy')}
                              className="op-synergy-operator"
                              aria-label={e.isContributor ? `${e.operatorName} — ${e.badges.map((b) => b.label).join(', ')}` : e.operatorName}
                            >
                              <div className="op-synergy-icons">
                                <Image src={e.operatorIconPath} alt={e.operatorName} width={40} height={40} />
                                {e.badges.length > 0 && (
                                  <div className="technique-entry-badge-row">
                                    {e.badges.slice(0, 3).map((b, bi) =>
                                      b.skillIconPath ? (
                                        <Image key={bi} src={b.skillIconPath} alt={b.label} width={16} height={16} className="technique-entry-badge-icon" />
                                      ) : (
                                        <span key={bi} className="technique-entry-badge-talent">
                                          {b.talentLabel}
                                        </span>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                        {group.entries.some((e) => e.isContributor) && (
                          <div className="op-synergy-source-list">
                            {group.entries
                              .filter((e) => e.isContributor)
                              .flatMap((e) =>
                                e.badges.map((b, bi) => (
                                  <p key={`${e.operatorName}-${bi}`} className="op-synergy-source-row">
                                    <Link prefetch={false} href={operatorHref(e.operatorName, 'synergy')} className="op-synergy-source-name">
                                      {e.operatorName}
                                    </Link>
                                    <span className="hint"> ({b.label})</span>: {b.sourceText}
                                  </p>
                                ))
                              )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ---- Character Info ---- */}
            {sectionVisible('characterInfo') && (
              <section id="operator-characterInfo" data-operator-section="characterInfo" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Profile</h2>
                  <div className={pageStyles.facts}>
                    <div className="op-sticky-meta op-sticky-meta-factions">
                      {operator.faction && (
                        <span>
                          <b>Main Faction:</b> {operator.faction}
                        </span>
                      )}
                      {operator.umbrellaFactions && operator.umbrellaFactions.length > 0 && (
                        <span>
                          <b>Umbrella Faction:</b> {operator.umbrellaFactions.join(', ')}
                        </span>
                      )}
                      {operator.connectedFactions && operator.connectedFactions.length > 0 && (
                        <span>
                          <b>Connected Faction:</b> {operator.connectedFactions.join(', ')}
                        </span>
                      )}
                      {!operator.faction &&
                        (!operator.umbrellaFactions || operator.umbrellaFactions.length === 0) &&
                        (!operator.connectedFactions || operator.connectedFactions.length === 0) && (
                          <span>
                            <b>Faction:</b> —
                          </span>
                        )}
                    </div>
                    <div className="op-sticky-meta op-sticky-tag-row">
                      {operator.position && <span className="op-tag-pill op-tag-pill-position">{operator.position}</span>}
                      {operator.tags?.map((t) => (
                        <span key={t} className="op-tag-pill">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="op-sticky-meta">
                      {/* A trait that changes starts each promotion on its own line under "Trait:". */}
                      <span>
                        Trait: {traitLines[0]?.stage && <br />}
                        {traitLines.length ? <OperatorTraitLines lines={traitLines} highlight={false} /> : '—'}
                      </span>
                      <span>
                        How to obtain: {howToObtainDisplay}
                        {releaseLabel && (
                          <span className="op-release-countdown"> ({releaseLabel})</span>
                        )}
                      </span>
                    </div>
                  </div>

                {([['Record', operator.characterInfo], ['Basic information', operator.basicInfo], ['Physical examination', operator.physicalExam]] as const)
                  .map(([label, block]) => block && (
                    <div key={label} className="op-char-info-block">
                      <h3>{label}</h3>
                      {Object.entries(block).map(([k, v]) => (
                        <p key={k} className={k === 'Auto Recovery' ? 'op-char-info-highlight' : undefined}>
                          <b>{k}:</b> {v}
                        </p>
                      ))}
                    </div>
                  ))}
              </section>
            )}

            {operator.files?.length ? (
              <div id="operator-files" data-operator-section="files" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <OperatorFilesPanel key={`files-${operator.name}`} files={operator.files} />
              </div>
            ) : null}

            {voiceData?.lines.length ? (
              <div id="operator-voiceLines" data-operator-section="voiceLines" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <OperatorVoiceLines key={`voices-${operator.internalName}`} data={voiceData} />
              </div>
            ) : null}

            {sectionVisible('guides') && (
              <section id="operator-guides" data-operator-section="guides" tabIndex={-1} className={`op-section ${pageStyles.section}`}>
                <h2>Guides</h2>
                {operator.guides && operator.guides.length > 0 ? (
                  <div className="video-scroller">
                    {operator.guides.map((g: GuideEntry, i: number) => (
                      <GuideVideoCard key={g.videoId || i} guide={g} operatorName={operator.name} />
                    ))}
                  </div>
                ) : (
                  <p className="hint">No guides yet!</p>
                )}
              </section>
            )}
            </div>
          </div>
          </div>
      </main>
      </div>

      {zooming && shownAppearance?.fullPath && (
        <SkinZoomOverlay voiceOperator={operator.name} image={shownAppearance.fullPath} name={shownAppearance.label} dynamic={dynamicArt[shownAppearance.label] ?? null} alternate={dynamicArt[`${shownAppearance.label}^sp_dyn`] ?? null}
          onClose={() => setZooming(false)} />
      )}
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const operators = getAllOperators();
  return {
    paths: operatorPageNames(operators).map(name => ({ params: { name } })),
    fallback: 'blocking',
  };
};

interface OperatorRelationIndexes {
  branches: Map<string, RelatedOperator[]>;
  artists: Map<string, RelatedOperator[]>;
  voiceActors: Map<string, RelatedOperator[]>;
}

let operatorRelationIndexes: OperatorRelationIndexes | null = null;

function buildOperatorRelationIndexes(allOperators: Operator[], skins: ReturnType<typeof getAllSkins>): OperatorRelationIndexes {
  if (operatorRelationIndexes) return operatorRelationIndexes;
  const branches = new Map<string, RelatedOperator[]>();
  const artists = new Map<string, RelatedOperator[]>();
  const voiceActors = new Map<string, RelatedOperator[]>();

  const add = (index: Map<string, RelatedOperator[]>, key: string | null | undefined, candidate: Operator) => {
    if (!key) return;
    const rows = index.get(key) ?? [];
    if (!rows.some(row => row.name === candidate.name)) {
      rows.push({ name: candidate.name, rarity: candidate.rarity, ...portraitStatus(candidate) });
      index.set(key, rows);
    }
  };

  for (const candidate of allOperators) {
    add(branches, candidate.branch, candidate);
    const credits = getOperatorArtworkCredits(candidate, getOperatorAppearances(candidate), skins);
    const candidateArtists = new Set(Object.values(credits).flatMap(credit => [credit.illustrator, credit.originalDesigner]).filter((value): value is string => Boolean(value)));
    candidateArtists.forEach(artist => add(artists, artist, candidate));

    const voices = getOperatorVoiceData(candidate.internalName ?? candidate.name);
    const candidateActors = new Set((voices?.packs ?? []).filter(pack => pack.status === 'current').flatMap(pack => pack.actors).filter(Boolean));
    candidateActors.forEach(actor => add(voiceActors, actor, candidate));
  }

  for (const index of [branches, artists, voiceActors]) {
    for (const rows of index.values()) rows.sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || a.name.localeCompare(b.name));
  }

  operatorRelationIndexes = { branches, artists, voiceActors };
  return operatorRelationIndexes;
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/operators/[name]", async ({ params }) => {
  const operator = getOperatorByName(params?.name as string);
  if (!operator) {
    return { notFound: true };
  }
  const appearances = getOperatorAppearances(operator);
  const skins = getAllSkins();
  const artworkCredits = getOperatorArtworkCredits(operator, appearances, skins);

  // Maps each skin appearance's label to a short "how to obtain" price
  // string (e.g. "18 OP", "400 DC"), reusing the exact same
  // parsePrices/formatPrices helpers the skins gallery uses off each
  // skin's own howToObtain text. Skins with no parseable certificate/
  // Originite Prime price (Default, Elite 2, most Collab pieces, Welfare,
  // etc.) are simply left out of the map -- nothing renders for those.
  const skinObtainByLabel: Record<string, string> = {};
  for (const skin of skins) {
    if (skin.model !== operator.name) continue;
    const prices = parsePrices(skin.howToObtain);
    if (prices.length > 0) skinObtainByLabel[skin.name] = formatPrices(prices);
  }

  /* Related-operator cards carry no release state. They used to carry an isFuture judged at
     content export, which froze until the next release -- and nothing on the page read it:
     a card's icon comes from its name, rarity and portraitStatus. */
  const allOperators = getAllOperators();
  const voiceData = getOperatorVoiceData(operator.internalName ?? operator.name);
  const relationIndexes = buildOperatorRelationIndexes(allOperators, skins);
  const withoutCurrent = (rows: RelatedOperator[] | undefined) => (rows ?? []).filter(row => row.name !== operator.name);
  const branchRelatedOperators = operator.branch ? withoutCurrent(relationIndexes.branches.get(operator.branch)) : [];
  const relatedByArtist = Object.fromEntries(
    [...new Set(Object.values(artworkCredits).flatMap(credit => [credit.illustrator, credit.originalDesigner]).filter((value): value is string => Boolean(value)))]
      .map(artist => [artist, withoutCurrent(relationIndexes.artists.get(artist))]),
  );
  const relatedByVoiceActor = Object.fromEntries(
    [...new Set((voiceData?.packs ?? []).filter(pack => pack.status === 'current').flatMap(pack => pack.actors).filter(Boolean))]
      .map(actor => [actor, withoutCurrent(relationIndexes.voiceActors.get(actor))]),
  );
  const synergyMatches: SynergyMatchOperator[][] = (operator.synergies || []).map((entry) => {
    if (entry.type === 'category') return []; // category matching isn't defined yet
    const matches = allOperators.filter((op) => {
      if (op.name === operator.name) return false;
      if (entry.type === 'branch') return op.branch !== null && entry.values.includes(op.branch);
      if (entry.type === 'faction') return op.faction !== null && entry.values.includes(op.faction);
      if (entry.type === 'tag') return op.tags.some((t) => entry.values.includes(t));
      if (entry.type === 'unit') return entry.values.includes(op.name);
      return false;
    });
    matches.sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0));
    // "unit" is an explicit, named list -- show all of them, not a
    // truncated roster match like branch/faction/tag.
    const limit = entry.type === 'unit' ? entry.values.length : entry.type === 'faction' ? 10 : 5;
    return matches.slice(0, limit).map((op) => ({ name: op.name, rarity: op.rarity }));
  });

  // Auto-detected faction/class synergies -- scans EVERY operator's
  // skills/talents for a mention of THIS operator's own faction or
  // class specifically (not the full 41-faction + 8-class sweep the
  // Synergies page does), since this section only needs to answer
  // "does this operator benefit from something, and who provides it."
  // Still needs the FULL candidate list when scanning each text,
  // though -- otherwise substring suppression (e.g. "Ursus" wrongly
  // matching inside "Ursus Student Self-Governing Group") can't work,
  // since there'd be nothing to suppress against.
  const allFactionNames = new Set<string>();
  for (const op of allOperators) {
    if (op.faction) allFactionNames.add(op.faction);
    (op.umbrellaFactions || []).forEach((f) => allFactionNames.add(f));
    (op.connectedFactions || []).forEach((f) => allFactionNames.add(f));
  }
  const allCandidateNames: { name: string; type: 'faction' | 'class' }[] = [
    ...Array.from(allFactionNames).map((name) => ({ name, type: 'faction' as const })),
    ...SYNERGY_CLASS_NAMES.map((name) => ({ name, type: 'class' as const })),
  ];
  const AUTO_SYNERGY_PAGE_SIZE = 10;
  const ownGroupTargets: { name: string; type: 'faction' | 'class' }[] = [];
  const seenOwnTargets = new Set<string>();
  function addOwnTarget(name: string | null | undefined, type: 'faction' | 'class') {
    if (!name || seenOwnTargets.has(`${type}-${name}`)) return;
    seenOwnTargets.add(`${type}-${name}`);
    ownGroupTargets.push({ name, type });
  }
  addOwnTarget(operator.faction, 'faction');
  (operator.umbrellaFactions || []).forEach((f) => addOwnTarget(f, 'faction'));
  (operator.connectedFactions || []).forEach((f) => addOwnTarget(f, 'faction'));
  addOwnTarget(operator.class, 'class');

  const autoSynergyGroups: AutoSynergyGroup[] = ownGroupTargets
    .map(({ name, type }) => {
      const groupKey = `${type}-${name}`;
      const opMap = new Map<string, AutoSynergyEntry & { rarity: number | null }>();

      for (const op of allOperators) {
        if (isSynergyExcluded(groupKey, op.name)) continue;
        const iconPath = getOperatorIconPath(op);
        const badges: AutoSynergyBadge[] = [];
        for (const skill of getSkillList(op)) {
          const highestLevelText = skill.levels.length > 0 ? skill.levels[skill.levels.length - 1].description : null;
          const found = highestLevelText ? findSynergyMatches(highestLevelText, allCandidateNames).find((m) => m.name === name && m.type === type) : null;
          if (found) {
            badges.push({ label: skill.name || '', skillIconPath: getSkillIconPath(op.name, skill.name), talentLabel: null, sourceText: highestLevelText, matchedKeyword: found.matchedTerm });
          }
        }
        (op.talents || []).forEach((talent, ti) => {
          const lastRowText = talent.rows.length > 0 ? talent.rows[talent.rows.length - 1].description : null;
          const found = lastRowText ? findSynergyMatches(lastRowText, allCandidateNames).find((m) => m.name === name && m.type === type) : null;
          if (found) {
            badges.push({ label: `T${ti + 1}`, skillIconPath: null, talentLabel: `T${ti + 1}`, sourceText: lastRowText, matchedKeyword: found.matchedTerm });
          }
        });
        if (badges.length > 0) {
          opMap.set(op.name, { operatorName: op.name, operatorIconPath: iconPath, isContributor: true, badges, rarity: op.rarity });
        }
      }

      if (opMap.size === 0) return null; // no genuine contributor found -- skip this group entirely, per "if there's a hit"

      for (const op of allOperators) {
        if (opMap.has(op.name)) continue;
        if (isSynergyExcluded(groupKey, op.name)) continue;
        // "Rhodes Island Recon" is itself an operator's name, whose
        // own faction field is literally "Rhodes Island" -- but they
        // aren't meant to be a synergy member of that faction.
        if (op.name === 'Rhodes Island Recon' && groupKey === 'faction-Rhodes Island') continue;
        const belongs = type === 'class' ? op.class === name : operatorBelongsToFaction(op, name);
        if (!belongs) continue;
        opMap.set(op.name, { operatorName: op.name, operatorIconPath: getOperatorIconPath(op), isContributor: false, badges: [], rarity: op.rarity });
      }

      const entries = Array.from(opMap.values())
        .sort((a, b) => {
          if (a.isContributor !== b.isContributor) return a.isContributor ? -1 : 1;
          return (b.rarity ?? 0) - (a.rarity ?? 0);
        })
        .slice(0, AUTO_SYNERGY_PAGE_SIZE) // hard cap, no pagination for this section
        .map(({ operatorName, operatorIconPath, isContributor, badges }) => ({ operatorName, operatorIconPath, isContributor, badges }));

      return { name, type, entries };
    })
    .filter((g): g is AutoSynergyGroup => g !== null);

  const techniqueUnitIcons: Record<string, SearchableOperator> = {};
  const techniqueBranchOperators: Record<string, SearchableOperator[]> = {};
  const techniqueGroupOperators: Record<string, SearchableOperator[]> = {};
  const allTechniqueLists: SkillTechnique[][] = [
    ...getSkillList(operator).map((s) => skillTechniques(operator, s)),
    ...(operator.talents || []).map((t) => talentTechniques(operator, t)),
  ];
  for (const techniques of allTechniqueLists) {
    for (const tech of techniques) {
      if (tech.unit && !techniqueUnitIcons[tech.unit]) {
        const match = allOperators.find((op) => op.name === tech.unit);
        if (match) techniqueUnitIcons[tech.unit] = { name: match.name, rarity: match.rarity, ...portraitStatus(match) };
      }
      if (tech.branch && !techniqueBranchOperators[tech.branch]) {
        const matches = allOperators.filter((op) => op.name !== operator.name && op.branch === tech.branch);
        matches.sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0));
        techniqueBranchOperators[tech.branch] = matches.slice(0, 5).map((op) => ({ name: op.name, rarity: op.rarity, ...portraitStatus(op) }));
      }
      if (tech.group && tech.members && !techniqueGroupOperators[tech.group]) {
        techniqueGroupOperators[tech.group] = tech.members
          .map((name) => allOperators.find((op) => op.name === name))
          .filter((op): op is (typeof allOperators)[number] => !!op)
          .map((op) => ({ name: op.name, rarity: op.rarity, ...portraitStatus(op) }));
      }
    }
  }

  // Which OTHER operators share each of this operator's own techniques
  // -- reuses the same site-wide grouping the standalone Techniques
  // page builds (buildTechniqueGroups is memoized, so this doesn't
  // re-run the expensive full-roster scan per operator page). Only
  // meaningful for "plain" techniques (no unit/branch/group reference
  // of their own already shown inline) -- those already display
  // relevant operators directly, so this would be redundant for them.
  const allGroupsByName = new Map(buildTechniqueGroups().map((g) => [g.name, g]));
  const techniqueRelatedOperators: Record<string, { entries: SearchableOperator[]; totalCount: number }> = {};
  for (const techniques of allTechniqueLists) {
    for (const tech of techniques) {
      if (tech.unit || tech.branch || tech.group) continue; // already covered inline above
      if (!tech.name) continue; // nothing to look up or key by without a name
      if (techniqueRelatedOperators[tech.name]) continue;
      const group = allGroupsByName.get(tech.name);
      if (!group) continue;
      const others = group.entries.filter((e) => e.operatorName !== operator.name);
      if (others.length === 0) continue;
      const entries: SearchableOperator[] = others.slice(0, 4).map((e) => {
        const match = allOperators.find((op) => op.name === e.operatorName);
        return { name: e.operatorName, rarity: e.rarity, ...(match ? portraitStatus(match) : {}) };
      });
      techniqueRelatedOperators[tech.name] = { entries, totalCount: others.length };
    }
  }

  /* The forms of this operator, if it has any. data/operator-forms.json is keyed by every
     form's name, so the Guard page finds the same list the Caster page does. Cast through
     unknown because a JSON import gives the index signature a literal type. */
  const formsIndex = OPERATOR_FORMS as unknown as Record<string, { forms: OperatorForm[]; default: string }>;
  const forms = formsIndex[operator.name]?.forms ?? null;

  /* Only this operator's entry. The file holds 174 operators and shipping all of it to
     every page would be 73 kB for the sake of one operator's three skills. */
  /* Through unknown, because a JSON import widens [1, 2] to number[] and CroppedRange
     wants the pair. The shape is guaranteed by the script that writes the file, which
     fails the build rather than emitting a grid it could not decode. */
  const allSkillRanges = SKILL_RANGES as unknown as Record<string, Record<string, SkillRangeChange>>;
  const skillRanges = allSkillRanges[operator.name] ?? null;
  // Resolve on the server: only this operator's compact grids reach the page.
  const overviewRanges = getOperatorAttackRanges(operator, OPERATOR_DEPLOY.ranges);

  const skillTimings = (SKILL_TIMINGS.operators as unknown as Record<string, (SkillTiming | null)[][]>)[operator.internalName ?? ''] ?? [];
  const factionPath = getFactionIconPath(operator.faction);
  const factionEmblem = factionPath && publicFileExists(factionPath) ? factionPath : null;
  // The cost rows sort by the release's catalogue, not by a list compiled into the page.
  const materialOrder = materialOrderFor(await loadMaterialCatalogue(), plannerCostNames(operator));
  // Only the pointer of each artwork that has an animated version: the model loads in the browser, when asked for.
  const dynamicArt = operatorDynamicArt(await loadDynamicArtIndex(), operator, appearances, skins);
  const { operatorEP } = await import('@/lib/operators/operatorEP');
  const summonTable = (await import('@/data/operator-summons.json')).default as unknown as Record<string, Summon[]>;
  const chibiIndex = (await import('@/data/chibi-art.json')).default as unknown as Record<string, ChibiFacings>;
  const chibis = Object.fromEntries(appearances.flatMap(appearance => { const id = appearanceSkinId(operator, appearance, skins); return id && chibiIndex[id] ? [[appearance.label, chibiIndex[id]]] : []; }));
  return { props: { chibis, summons: summonTable[operator.internalName ?? ''] ?? [], epTrack: operatorEP(operator), artworkCredits, factionEmblem, skillTimings, operator, appearances, skinObtainByLabel, synergyMatches, autoSynergyGroups, techniqueUnitIcons, techniqueBranchOperators, techniqueGroupOperators, techniqueRelatedOperators, forms, skillRanges, overviewRanges, voiceData, branchRelatedOperators, relatedByArtist, relatedByVoiceActor, materialOrder, dynamicArt } };
}, {
  // A release exported before cost rows carried their order: this deployment's catalogue fills it in.
  // And one exported before animated art: this deployment's data/dynamic-art.json fills the pointers in.
  finalize: (props) => withMaterialOrder(props, (page) => plannerCostNames(page.operator)).then(withOperatorDynamicArt).then(async page => {
    const { operatorEP } = await import('@/lib/operators/operatorEP');
    const summonTable = (await import('@/data/operator-summons.json')).default as unknown as Record<string, Summon[]>;
    const chibiIndex = (await import('@/data/chibi-art.json')).default as unknown as Record<string, ChibiFacings>;
    const skins = (await import('@/data/skins.json')).default as import('@/lib/skins/skinTypes').Skin[];
    const chibis = Object.fromEntries(page.appearances.flatMap(appearance => { const id = appearanceSkinId(page.operator, appearance, skins); return id && chibiIndex[id] ? [[appearance.label, chibiIndex[id]]] : []; }));
    return { ...page, chibis: page.chibis ?? chibis, summons: page.summons ?? summonTable[page.operator.internalName ?? ''] ?? [], epTrack: page.epTrack === undefined ? operatorEP(page.operator) : page.epTrack };
  }),
});
