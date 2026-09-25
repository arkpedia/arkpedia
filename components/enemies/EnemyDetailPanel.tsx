import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { STAT_ICONS } from '@/components/enemies/EnemyStatIcons';
import ContentPicker, { ContentPickerOption } from '@/components/ui/ContentPicker';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import EnemyRangeMap from '@/components/enemies/EnemyRangeMap';
import EnemyStatusPopover from '@/components/enemies/EnemyStatusPopover';
import { ENEMY_STATUSES, type EnemyStatusOperatorMap } from '@/lib/enemies/statusOperators';
import {
  Enemy,
  EnemyContent,
  EnemyLevel,
  EnemySkill,
  EnemyStageAppearance,
  EnemyTalent,
} from '@/lib/enemies/enemyTypes';

/**
 * One enemy's whole record, drawn the way the handbook draws it.
 *
 * Lifted out of pages/enemies/index.tsx unchanged, because the Stronghold Protocol
 * page wants the same panel for the 119 creatures in the mode's own pools: the record
 * is a static JSON file either way, so the only thing that was page-shaped about this
 * was where it happened to be written down.
 */
/** One enemy's record, as scripts/build/build-enemy-details.mjs writes it out. */
export interface EnemyDetailData {
  enemy: Enemy;
  introducedBy: EnemyContent;
  /** Every content that fields this enemy, each with the stages inside it. */
  appearances: EnemyStageAppearance[];
  /** Enemy ids referenced by this enemy's skill/talent parameters. */
  referenced: Record<string, { name: string; slug: string }>;
}

const DASH = '—';

type DetailTab = 'resistances' | 'range' | 'abilities' | 'stages';

/**
 * Four enemies the ability prose does not cover. Their blockCnt is an explicit 0 in
 * enemy_database -- genuinely unblockable -- but not one of them says so in words,
 * so the sentence-matching below cannot find them. Listed by id because blockCnt is
 * not among the fields our data files carry; extracting it upstream would retire
 * this list, and until then a default of "Block 1" would state the opposite of the
 * truth for the four of them.
 */
const UNBLOCKABLE_BY_DATA = new Set([
  'enemy_1582_suisho', // Sui
  'enemy_1583_suizzh', // Left Claw of Sui
  'enemy_1584_suiyzh', // Right Claw of Sui
  'enemy_1585_suiwei', // Tail of Sui
]);

/**
 * How much to shrink a long name so its row still fits on one line.
 *
 * Names run from 1 to 46 characters: 935 of the 1,585 are under 20, 553 sit in the
 * twenties, 93 in the thirties and 4 above 40 ("'Samivilinn,' the Resolution of the
 * Very North"). At the name's 26px, anything past about 20 characters pushed the rank
 * tag and the life-point cost onto a line of their own.
 *
 * Stepped off the character count rather than measured: it is decided during render,
 * so the name is never painted at one size and corrected to another, and it needs no
 * client-side measuring pass. Character count is only a proxy for width -- a name of
 * capital Ws is wider than one of Is -- so the steps leave headroom rather than
 * cutting it fine.
 */
function nameSizeClass(name: string): string | undefined {
  const n = name.length;
  if (n <= 19) return undefined;
  if (n <= 27) return 'enemy-name-m';
  if (n <= 35) return 'enemy-name-s';
  return 'enemy-name-xs';
}


function num(v: number | null | undefined): string {
  if (v == null) return DASH;
  return (Math.round(v * 1000) / 1000).toLocaleString('en-US');
}

function pct(v: number | null | undefined): string {
  return v == null ? DASH : `${Math.round(v * 1000) / 1000}%`;
}

/**
 * Upstream text carries literal "\n" escapes, angle-bracket keyword markup
 * (`<Stun>`) that the game renders as an emphasised term, and square-bracketed
 * skill names (`[Icicle Fall]`). React escapes the content for us, so this only
 * has to handle the line breaks and the two kinds of emphasis.
 */
function FormattedGameText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\\n|\n/).map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(<[^<>]{1,48}>|\[[^[\]]{1,48}\])/g).map((part, j) =>
            part.startsWith('<') && part.endsWith('>') ? (
              <em key={j}>{part}</em>
            ) : part.startsWith('[') && part.endsWith(']') ? (
              // A named skill: "[Whirlwind Smash] Curls into a ball and dashes".
              // 538 of these across 301 distinct names, and they were running
              // together with the sentence describing them.
              <span className="enemy-skill-name" key={j}>
                {part}
              </span>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Skill and talent keys are the game's own internal handles -- "StartRun",
 * "fake_revive", sometimes just "1". Spaced out and title-cased where that
 * reads as English, numbered where it does not. Never invented into a name
 * the game doesn't use; the raw handle is still shown next to it.
 */
function prettyKey(key: string | null, index: number, word: string): string {
  const s = String(key ?? '');
  if (!s || /^\d+$/.test(s)) return `${word} ${index + 1}`;
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * A blackboard key is scoped by whatever owns it, and that scope is a raw
 * gamedata id: "enemy_act29side[buff_depressed_lite].atk". The scope isn't
 * information for a reader -- the row already sits under the talent it
 * belongs to -- so it comes off and only the meaningful tail is shown.
 */
function paramKey(key: string): string {
  let s = String(key ?? '');
  s = s.replace(/^[a-z0-9_]*\[[^\]]*\]\.?/i, '');
  s = s.replace(/^(enemy|char|skill|summon\d*)_?\d*_?[a-z0-9]*\./i, '');
  return (s || String(key)).replace(/_/g, ' ').trim();
}

/**
 * One cell of the handbook's stat grid: glyph, label, figure, letter grade -- in
 * that order, which is the order the game reads them in.
 *
 * The figure is ours. The game shows the grade alone, which is no use for planning
 * against a DEF value, so the number sits to its left rather than replacing it.
 */
function StatCell({
  icon, label, value, grade,
}: {
  icon?: string;
  /** A node, not a string, so the two long labels can carry their own line break. */
  label: React.ReactNode;
  value: string;
  grade?: string | null;
}) {
  return (
    <div className="enemy-stat">
      {icon && STAT_ICONS[icon] ? <span className="enemy-stat-icon">{STAT_ICONS[icon]}</span> : null}
      <span className="enemy-stat-label">{label}</span>
      <span className="enemy-stat-value">{value}</span>
      {grade ? <span className={`enemy-grade grade-${grade.replace('+', 'plus').toLowerCase()}`}>{grade}</span> : null}
    </div>
  );
}

function ModuleList({
  title,
  entries,
  word,
  referenced,
  note,
}: {
  title: string;
  entries: (EnemySkill | EnemyTalent)[];
  word: 'Skill' | 'Talent';
  referenced: EnemyDetailData['referenced'];
  /** Rendered under the heading's rule -- the SP pool, for skills. */
  note?: React.ReactNode;
}) {
  if (!entries.length) return null;
  return (
    <section className="enemy-section">
      <h3 className="enemy-section-head">{title}</h3>
      {note}
      <div className="enemy-mods">
        {entries.map((m, i) => {
          const skill = word === 'Skill' ? (m as EnemySkill) : null;
          return (
            <div className="enemy-mod" key={`${m.key}-${i}`}>
              <div className="enemy-mod-head">
                <span className="enemy-mod-name">
                  {prettyKey(m.key, i, word)}
                  {m.key && !/^\d+$/.test(String(m.key)) && <code>{m.key}</code>}
                </span>
                {skill && (
                  <span className="enemy-mod-meta">
                    {skill.cooldown != null && (
                      <span className="enemy-kv">
                        <span>CD</span> {num(skill.cooldown)}s
                      </span>
                    )}
                    {skill.initial_cooldown != null && (
                      <span className="enemy-kv">
                        <span>FIRST</span> {num(skill.initial_cooldown)}s
                      </span>
                    )}
                    {!!skill.sp_cost && (
                      <span className="enemy-kv">
                        <span>SP</span> {skill.sp_cost}
                      </span>
                    )}
                    {!!skill.priority && (
                      <span className="enemy-kv">
                        <span>PRIO</span> {skill.priority}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {!!Object.keys(m.parameters || {}).length && (
                <div className="enemy-params">
                  {Object.entries(m.parameters).map(([k, v]) => {
                    // A parameter value is sometimes an enemy id -- a summon
                    // skill naming what it summons. Link it rather than
                    // printing the handle.
                    const hit = typeof v === 'string' ? referenced[v] : undefined;
                    return (
                      <span className="enemy-param" key={k}>
                        <i>{paramKey(k)}</i>
                        {hit ? (
                          <Link prefetch={false} href={`/enemies/${encodeURIComponent(hit.slug)}`}>{hit.name}</Link>
                        ) : typeof v === 'number' ? (
                          num(v)
                        ) : (
                          String(v)
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function EnemyDetailPanel({ enemy, introducedBy, appearances, referenced, statusOperators = {} }: EnemyDetailData & { statusOperators?: EnemyStatusOperatorMap }) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [tab, setTab] = useState<DetailTab>('resistances');
  /* The tabs below swap content of very different heights (nine immunity rows against
     a long list of stages), and on a phone the pane flows in the page: switching to a
     shorter tab near the foot left the document too short for the reader's position,
     the browser clamped it and the tab row jumped 55px down the screen (2026-09-25
     review, UC-10). The floor holds what the position needs, per enemy. */
  const tabFloor = useHeightFloor(enemy.slug);
  const level: EnemyLevel = enemy.levels[levelIndex] ?? enemy.levels[0];
  const s = level.stats;
  const g = level.stat_ranks;

  // Opens on the content that introduced the enemy where that content also
  // fields it, which is the one a reader is most likely to be looking for.
  const defaultContentId =
    (appearances.some((a) => a.id === introducedBy.id) ? introducedBy.id : appearances[0]?.id) || '';
  const [contentId, setContentId] = useState(defaultContentId);

  /**
   * Picking another enemy starts it fresh. The grid navigates client-side, so this
   * component stays mounted and every choice made about one enemy was still in force
   * for the next: ask for Stages on a boss and the next twelve enemies opened on
   * Stages too. The tab was the visible half. The level index was the worse half --
   * index 2, held over onto a two-level enemy, left BOTH level buttons unselected
   * while Lv 0's numbers were the ones on screen. The content picker also stopped opening
   * on the introducing content after the first navigation.
   *
   * Adjusted during render rather than in an effect, which is what React documents
   * for state that depends on a prop: an effect would commit one frame showing the
   * previous enemy's selections first.
   */
  /**
   * Taunt is granted from either of two places and the stat block only knew about
   * one. `stats.taunt` carries it for 643 level rows, but 7 leave it null and grant
   * it through a `taunt` talent instead -- Guerrilla Shieldguard Leader reads
   * "taunt level 1" in its talents while this block printed 0. No row carries both,
   * so there is nothing to reconcile: take whichever is present.
   *
   * Absent from both is a real 0, not unknown, which is why this ends in 0 rather
   * than a dash: taunt level 0 is the default every enemy fights at.
   */
  const tauntTalent = level.talents.find((t) => t.key === 'taunt');
  const tauntFromTalent = tauntTalent?.parameters?.taunt_level;
  const tauntLevel =
    s.taunt ?? (typeof tauntFromTalent === 'number' ? tauntFromTalent : 0);

  /**
   * Silence only does something to an enemy that has something to switch off, and
   * the flag upstream puts on an ability is what decides that -- not whether the
   * enemy happens to own a skill entry.
   *
   * Requiring an empty skill list as well, as this did first time round, left
   * Theresa, King of Sarkaz reading "Vulnerable": one skill in the data, not one
   * silenceable ability, so Silence does nothing to her while the page said to bring
   * it. Of 1,784 level rows, 680 are immune outright, 888 have nothing to silence
   * (221 more than the skills clause allowed), and 216 are genuinely open to it.
   *
   * Kept separate from real immunity so the pane can say which of the two it is,
   * rather than flattening a fact about the enemy into a fact about the data.
   */
  /**
   * How many Block an operator needs to hold this enemy, and whether anything can.
   * Neither is a stat: enemy_database leaves blockCnt undefined on 2,384 of its 2,389
   * rows (the five that define it say 0 or 1), so the real figure is stated in the
   * ability prose the same way taunt is granted by a talent.
   *
   * "Can only be blocked by Operators with 3 or more Block", "...by units with at
   * least 2 Block", "...by a Goalkeeper or unit with Block Count of 3 or higher" --
   * five sentence shapes, all saying the same thing. 52 enemies carry a requirement
   * (8 at two, 38 at three, 6 at four) and 94 cannot be blocked at all. No enemy is
   * both, which is what you would hope.
   */
  /**
   * What this enemy costs you if it gets through, always stated.
   *
   * It was hidden whenever the figure was null -- 104 of the 1,784 level rows,
   * Sarkaz Heirbearer Wrathgorger among them -- which read as "this one is free"
   * when it means the opposite. Upstream distinguishes the two: of its rows, 1,528
   * define lifePointReduce as 1 and 202 define it as 0, while 422 leave it
   * undefined. Something the game says explicitly when it means 0 is not what it
   * leaves blank, so blank is the ordinary leak of 1 -- the same reading as an
   * absent taunt level or an unstated block requirement.
   */
  const lifeCost = s.life_cost ?? 1;

  /**
   * Unblockable, read from the prose -- but only where the prose is about THIS enemy.
   * Rebellion Instigator and Rebellion Agitator both say "all unrevealed Civilians or
   * Spies cannot be blocked", which is a fact about the units they hide among, and a
   * plain text match labelled the instigators themselves Unblockable.
   *
   * Only that case is excluded. Several others are conditional -- "cannot be blocked
   * when Invisible", "becomes unblockable" after a skill -- and those are left
   * reading Unblockable, because the alternative is "Block 1", which is just as wrong
   * for the half of the fight where it does not hold. Narrowing that properly means
   * modelling conditions, not tightening a regex: an attempt at it dropped "Cannot be
   * blocked by Operators or Summons", which is flatly true.
   */
  const unblockable =
    UNBLOCKABLE_BY_DATA.has(enemy.id) ||
    enemy.abilities.some((a) => {
      const text = a.text || '';
      if (!/cannot be blocked|unblockable/i.test(text)) return false;
      const clause =
        text.split(/[.;]/).find((c) => /cannot be blocked|unblockable/i.test(c)) ?? text;
      return !/\b(civilians?|spies)\b/i.test(clause);
    });
  /**
   * Always a number for a blockable enemy: the prose states a requirement only when
   * it is above one, so no sentence means the ordinary 1. Shown either way -- a
   * reader wants to know it is 1 rather than have to infer it from silence.
   */
  const blockRequired = (() => {
    if (unblockable) return null;
    for (const a of enemy.abilities) {
      const m = /blocked by[^.]*?(?:with|of)\s+(?:at least\s+)?(\d+)\s*(?:or more|or higher)?\s*Block|Block Count of\s+(\d+)/i.exec(
        a.text || ''
      );
      if (m) return Number(m[1] || m[2]);
    }
    return 1;
  })();

  const silenceIsMoot =
    !level.immunities.includes('Silence') &&
    !enemy.abilities.some((a) => a.format === 'silence');

  /**
   * Shrinks the name until it fits its row.
   *
   * The character-count steps get close but cannot be right, because how much room a
   * name has depends on what else is in the row: a BOSS tag is wider than NORMAL, and
   * a two-level enemy carries a Lv switch worth about 110px. "The Endspeaker, Will of
   * We Many" is 31 characters -- comfortably inside the third step -- and still ran
   * over the BOSS tag beside it.
   *
   * So the step is the starting guess, rendered on the server, and this corrects it
   * only when the name actually overflows: it reads scrollWidth against clientWidth
   * and takes a pixel off at a time. Bounded at 13px, and the CSS keeps an ellipsis
   * for the case where even that will not fit, so a name can never sit on top of the
   * tag next to it. Re-runs on resize and on every enemy, since the room changes with
   * both.
   */
  const nameRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 1 && size > 13 && guard < 24) {
        size -= 1;
        guard += 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const row = el.parentElement;
    const ro = row ? new ResizeObserver(fit) : null;
    if (row && ro) ro.observe(row);
    return () => ro?.disconnect();
  }, [enemy.slug, enemy.name, levelIndex]);

  const [shownSlug, setShownSlug] = useState(enemy.slug);
  if (shownSlug !== enemy.slug) {
    setShownSlug(enemy.slug);
    setTab('resistances');
    setLevelIndex(0);
    setContentId(defaultContentId);
  }
  const selected = appearances.find((a) => a.id === contentId) || appearances[0];
  const options: ContentPickerOption[] = useMemo(
    () => appearances.map(({ kind, id, label, name, stages }) => ({
      kind, id, label, name, count: stages.length,
    })),
    [appearances]
  );

  // Four records carry a single "-" ability, which is upstream's placeholder
  // for "this enemy has none" rather than an ability whose text is a dash.
  // Rendering it gives an Abilities section with one empty bullet.
  const abilities = enemy.abilities.filter((a) => (a.text || '').trim().replace(/^[-—]+$/, ''));

  // Only the tabs this enemy has anything for -- a blank Abilities pane says less
  // than no tab at all.
  const abilityCount = abilities.length + level.skills.length + level.talents.length;
  /* No Stats tab any more: the stat block is always on screen above these, the way
     the handbook shows it, so a tab for it would switch to what is already there. */
  /**
   * Range is a tab only when there is a radius to draw. It is absent on 1,048 of the
   * 1,784 level rows and that absence lines up with melee: 762 Melee rows have no
   * figure against 527 Ranged rows that do. An explicit 0.0 exists too, on 23 rows,
   * and means the same thing -- it reaches its own tile and no further -- so neither
   * gets a tab rather than one showing a circle with no area.
   */
  const rangeRadius = s.range == null ? null : Number(s.range);
  const hasRange = rangeRadius != null && Number.isFinite(rangeRadius) && rangeRadius > 0;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'resistances', label: 'Resistances' },
    ...(hasRange ? [{ key: 'range' as DetailTab, label: 'Range' }] : []),
    ...(abilityCount ? [{ key: 'abilities' as DetailTab, label: 'Abilities' }] : []),
    ...(appearances.length ? [{ key: 'stages' as DetailTab, label: 'Stages' }] : []),
  ];
  // Kept as a backstop even though the tab resets above: an enemy with no abilities
  // and no appearances has neither tab, so a stale key would render an empty pane.
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  return (
    <>
        {/* The handbook's own heading order: race, then code and name, then how it
            fights. The picture is no longer up here -- it belongs beside the stat
            grid below, which is where the game puts it. */}
        <div className="enemy-hero">
          <div className="enemy-hero-text">
            {/* Always rendered, empty or not. 937 of the 1,585 enemies have no race
                upstream, and letting the line collapse moved the name, the portrait
                and every stat under it up by a row -- so the whole panel jumped as
                you clicked between a Sarkaz and a slug. */}
            <div className="enemy-race">{enemy.race || ''}</div>
            <div className="enemy-hero-name">
              {enemy.index && <span className="enemy-code">{enemy.index}</span>}
              <h2 ref={nameRef} className={nameSizeClass(enemy.name)}>{enemy.name}</h2>
              <span className={`enemy-rank-tag rank-${enemy.rank.toLowerCase()}`}>{enemy.rank}</span>
              {/* The level switch and the life-point cost are grouped, and the group
                  is what carries margin-left:auto. Putting it on the level switch
                  itself only right-bound the pair when there WAS a level switch --
                  1,403 of the 1,585 enemies have a single level, so on most of them
                  nothing held the auto margin and the cost simply trailed the rank
                  tag. A wrapper cannot come apart when one of its children is absent. */}
              {/* The level switch and the life-point cost are grouped, and the group
                  carries margin-left:auto. Putting it on the level switch only
                  right-bound the pair when there WAS a switch -- 1,403 of the 1,585
                  enemies have a single level, so on most of them nothing held the auto
                  margin and the cost just trailed the rank tag. A wrapper cannot come
                  apart when one of its children is absent.

                  Levels are labelled Lv 0 / Lv 1 / Lv 2 with gamedata's own numbers,
                  which start at zero: 165 enemies have two and 17 have three. The
                  level is the stat block a stage picks when it fields the enemy and
                  implies nothing about strength -- five get WEAKER higher up, Dual
                  Swordsman going 2,000 HP to 1,950. */}
              <span className="enemy-hero-name-right">
                {enemy.levels.length > 1 && (
                  <SegmentedControl
                    className="enemy-level-tabs"
                    label="Stat level"
                    value={levelIndex}
                    onChange={setLevelIndex}
                    options={enemy.levels.map((lv, i) => ({ value: i, label: `Lv ${lv.level}` }))}
                  />
                )}
              </span>
            </div>
            <div className="enemy-attack-line">
              {[enemy.attack_position, enemy.damage_type.join(' / ')].filter(Boolean).join(' ')}
              {enemy.movement && <span className="enemy-attack-move">{enemy.movement}</span>}
              <span className="enemy-attack-line-right">
                  {/* Order is taunt, then block, then the life cost. Block is always
                    stated -- 1 is a fact worth reading, not a silence to interpret --
                    while taunt only appears when it is not the 0 everything else
                    fights at, which is 83 of the 1,784 level rows. */}
                {Number(tauntLevel) !== 0 && (
                  <span className="enemy-attack-badge" title="Targeting priority: higher is attacked first">
                    <span className="enemy-stat-icon">{STAT_ICONS.taunt}</span>
                    Taunt {Number(tauntLevel)}
                  </span>
                )}
                {unblockable && (
                  <span className="enemy-attack-badge is-unblockable" title="No operator can block this enemy">
                    <span className="enemy-stat-icon">{STAT_ICONS.block_none}</span>
                    Unblockable
                  </span>
                )}
                {blockRequired != null && (
                  <span
                    className="enemy-attack-badge"
                    title={
                    blockRequired === 1
                      ? 'Any operator with Block can hold it'
                      : `Only an operator with ${blockRequired} or more Block can hold it`
                  }
                  >
                    <span className="enemy-stat-icon">{STAT_ICONS.block}</span>
                    Block {blockRequired}
                  </span>
                )}
                  {/* Down here rather than beside the name: this line has room to spare
                    on every enemy, where the name's row is the one that runs out. */}
                <span
                  className={`enemy-lifepoints${lifeCost === 0 ? ' is-free' : ''}`}
                  title={
                    lifeCost === 0
                      ? 'Costs no life points if it reaches the objective'
                      : `Costs ${lifeCost} life ${lifeCost === 1 ? 'point' : 'points'} if it reaches the objective`
                  }
                >
                  <span className="enemy-stat-icon">{STAT_ICONS.life_cost}</span>
                  {num(lifeCost)}
                </span>
              </span>
            </div>
          </div>
        </div>
        {/* Picture left, the grid right, exactly as the handbook arranges them --
            and both always on screen, so the numbers are never a tab away. Weight
            sits under the art in its own box, where the game puts it. */}
        <div className="enemy-statblock">
          <div className="enemy-statblock-art">
            <div className="avatar enemy-hero-icon">
              {enemy.icon ? (
                <Image
                  src={enemy.icon}
                  alt={enemy.name}
                  fill
                  sizes="120px"
                  unoptimized
                />
              ) : (
                <span className="fallback">{enemy.name[0]}</span>
              )}
            </div>
            <div className="enemy-art-stat">
              <span className="enemy-stat-icon">{STAT_ICONS.weight}</span>
              <span className="enemy-stat-label">Weight</span>
              <span className="enemy-stat-value">{num(s.weight)}</span>
            </div>

          </div>
          {/* The eight the game shows, in its order: the left column down, then the
              right. ASPD is attack_speed -- the graded percentage the game grades --
              not attack_interval, which is seconds and has no grade; that one is
              kept below with the other figures the handbook leaves out. */}
          <div className="enemy-stats">
            <StatCell icon="hp" label="HP" value={num(s.hp)} grade={g.hp} />
            {/* Broken explicitly, not left to wrap. Where these two land depended on
                the width of the figure beside them -- "0.5" leaves more room than
                "0.85" -- so they were one line on some enemies and two on others, and
                every row height followed. Two lines always, and the cells below share
                one height, so the grid is the same shape on all 1,585. */}
            <StatCell
              icon="move_speed"
              label={<>Movement<br />Speed</>}
              value={num(s.move_speed)}
              grade={g.move_speed}
            />
            <StatCell icon="atk" label="ATK" value={num(s.atk)} grade={g.atk} />
            {/* The interval in seconds, not the 100% the game prints: the percentage
                is a multiplier against a baseline the page never shows, so it read as
                a constant on nearly every enemy. The grade is still ASPD's own. */}
            <StatCell
              icon="attack_speed"
              label={<>Attack<br />Interval</>}
              value={s.attack_interval == null ? DASH : `${num(s.attack_interval)}s`}
              grade={g.attack_speed}
            />
            <StatCell icon="def" label="DEF" value={num(s.def)} grade={g.def} />
            <StatCell icon="elemental_res" label="Elemental RES" value={pct(s.elemental_res)} grade={g.elemental_res} />
            <StatCell icon="res" label="RES" value={pct(s.res)} grade={g.res} />
            <StatCell
              icon="elemental_damage_res"
              label="Effect Res"
              value={pct(s.elemental_damage_res)}
              grade={g.elemental_damage_res}
            />
          </div>
        </div>
        {/* Collapsed, so the numbers above it never get pushed off the screen by a
            four-line description. Open by choice, closed by default. */}
        {enemy.flavour_text && (
          <details className="enemy-flavour-drop">
            <summary className="enemy-section-head">Description</summary>
            <p className="enemy-flavour">
              <FormattedGameText text={enemy.flavour_text} />
            </p>
          </details>
        )}
        {/* One thing at a time. Folding sections still left the reader scrolling
            past collapsed headings to reach the next one; a tab strip means the
            pane only ever holds what was asked for. The identity above stays put,
            so you always know whose numbers these are. */}
        <SegmentedControl
          className="enemy-tabs"
          label="Show"
          value={activeTab ?? 'resistances'}
          onChange={setTab}
          options={tabs.map((t) => ({ value: t.key, label: t.label }))}
        />

        <div className="enemy-tab-body" ref={tabFloor.ref}>
        {/* The figures the handbook does not print. Kept because the data has them
            and someone planning around a stall needs the interval, but out of the
            grid, which is the game's eight and only those. */}
        {activeTab === 'resistances' && (
          <section className="enemy-section">
            {/* Both halves, because the useful question is usually the second one:
                "can I stun it" is answered by absence, and a list of immunities alone
                leaves you inferring that from what is missing. The status list is
                fixed, so every enemy answers for all nine. */}
            <h3 className="enemy-section-head">Status immunity</h3>
            <div className="enemy-resist-grid">
              {ENEMY_STATUSES.map((st) => {
                const moot = st === 'Silence' && silenceIsMoot;
                const immune = level.immunities.includes(st) || moot;
                const row = <div className={`enemy-resist${immune ? ' immune' : ' vulnerable'}`}>
                    <span className="enemy-resist-mark" aria-hidden="true">{immune ? '\u2715' : '\u2713'}</span>
                    <span className="enemy-resist-name">{st}</span>
                    <span className="enemy-resist-verdict">
                      {moot ? 'No effect' : immune ? 'Immune' : 'Vulnerable'}
                    </span>
                  </div>;
                const operators = statusOperators[st];
                return operators
                  ? <EnemyStatusPopover key={st} status={st} group={operators} immune={immune}>{row}</EnemyStatusPopover>
                  : <Fragment key={st}>{row}</Fragment>;
              })}
            </div>
          </section>
        )}

        {activeTab === 'range' && hasRange && (
          <section className="enemy-section">
            <h3 className="enemy-section-head">
              Attack range
              <span className="enemy-section-aside">{rangeRadius} tiles</span>
            </h3>
            <EnemyRangeMap radius={rangeRadius!} icon={enemy.icon} name={enemy.name} />
          </section>
        )}

        {activeTab === 'abilities' && (
          <>
        {abilities.length > 0 && (
          <section className="enemy-section">
            <h3 className="enemy-section-head">Abilities</h3>
            {/* format:'silence' is upstream's own flag for an ability that Silence
                switches off, and the game marks those with a crossed-blades X. It
                was being dropped: 217 abilities across the dataset carry it, and
                they rendered as ordinary bullets, so the page lost the one thing
                that tells you whether Silence is worth bringing. */}
            <ul className="enemy-abilities">
              {abilities.map((a, i) => (
                <li
                  key={i}
                  className={
                    a.format === 'title'
                      ? 'enemy-ability-title'
                      : a.format === 'silence'
                        ? 'enemy-ability-silence'
                        : undefined
                  }
                >
                  {a.format === 'silence' && (
                    <span className="enemy-silence-mark" title="Silence switches this off">
                      {STAT_ICONS.silence}
                    </span>
                  )}
                  <FormattedGameText text={a.text} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {level.skills.length > 0 && (
          /* SP belongs to the skills -- it is the pool they spend and the rate it
             fills at -- and it goes through ModuleList's note so it lands under the
             heading's rule instead of above the heading. */
          <ModuleList
            title="Skills"
            entries={level.skills}
            word="Skill"
            referenced={referenced}
            note={
              level.sp ? (
                <p className="hint enemy-sp">
                  <span className="enemy-stat-label">SP</span> {num(level.sp.initial)}/{num(level.sp.max)}
                  {level.sp.recovery && ` · ${level.sp.recovery}`}
                  {level.sp.increment != null && ` · +${num(level.sp.increment)}`}
                </p>
              ) : null
            }
          />
        )}
        {level.talents.length > 0 && (
          <ModuleList title="Talents" entries={level.talents} word="Talent" referenced={referenced} />
        )}
          </>
        )}

        {activeTab === 'stages' && (
          <>
        <section className="enemy-section">
          <h3 className="enemy-section-head">Appearances</h3>
          {/* Introduction and appearance are different facts: this enemy was
              introduced by exactly one piece of content but can be fielded by any
              number of others, so this is the whole set, not "the rest". A picker
              rather than every content at once, because the busiest enemy is
              fielded in 26 of them across 223 stages. */}
          {appearances.length === 0 ? (
            <p className="hint">No content in the current dataset fields this enemy.</p>
          ) : (
            <>
              {/* A labelled control rather than a full-width bar: at the pane's width
                  the bar read as a heading for the list under it instead of the thing
                  you change to pick that list. */}
              <div className="enemy-appear-filter">
                <span className="enemy-appear-filter-label">Filter</span>
                <ContentPicker
                  options={options}
                  value={selected.id}
                  onChange={setContentId}
                  ariaLabel="Content to list stages for"
                />
              </div>
              {selected.stages.length === 0 && (
                <p className="hint">
                  No stage of this content names it: the mode fields it directly -- an Enemy Rush, a
                  Rift re-skinning the roster, or a boss the event declares -- or its stages are not
                  listed on the stages page.
                </p>
              )}
              <ul className="enemy-appear-stages">
                {selected.stages.map((stage) => (
                  <li key={stage.slug}>
                    {/* The stages page is a separate branch, so these resolve once
                        it merges. The slug is the one that page builds its route
                        from, and only stages that get a page are in this data. */}
                    <Link prefetch={false} href={`/stages/browse?s=${encodeURIComponent(stage.slug)}`} className="enemy-appear-stage-code">
                      {stage.code}
                    </Link>
                    {stage.name && <span className="enemy-appear-stage-name">{stage.name}</span>}
                    {stage.variant && <span className="enemy-intro-tag">{stage.variant}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
          </>
        )}
        {tabFloor.spacer}
        </div>
    </>
  );
}
