import { PromotionIcon } from "./PromotionIcon";
import Image from '@/components/content/ContentImage';
import { useState } from 'react';
import { LEVEL_CAPS, maxEliteForRarity, maxLevelForElite, maxSkillRankForElite, moduleUnlock } from '@/lib/planner/plannerLogic';

/**
 * The four axes of an operator build, in the order the game unlocks them.
 *
 * Used twice with different copy: "where they are now", which is what the
 * roster records, and "target", which is what the plan asks for. Same four
 * blocks, same locks, and it writes to whichever of the two the caller hands
 * it -- one screen for one fact rather than two that could disagree.
 *
 * Both current and goal choices add prerequisites atomically with the
 * selected upgrade, so the controls stay available without invalid states.
 */

export interface StateFormSkill {
  name: string;
  icon: string | null;
}

export interface StateFormModule {
  name: string;
  icon: string | null;
  /** How many stages this module has -- 3 for almost all of them, read from
   *  the operator's own record rather than assumed. */
  stages: number;
}

export function OperatorStateForm({
  mode,
  rarity,
  skills,
  modules,
  elite,
  level,
  skillLevel,
  masteryOf,
  moduleStageOf,
  minElite = 0,
  minLevel = 1,
  minSkillLevel = 1,
  minMasteryOf,
  minModuleStageOf,
  onElite,
  onLevel,
  onSkillLevel,
  onMastery,
  onModuleStage,
  skillDescription,
  moduleDescription,
}: {
  mode: 'current' | 'target';
  rarity: number;
  skills: StateFormSkill[];
  modules: StateFormModule[];
  elite: number;
  level: number;
  skillLevel: number;
  /** 0 for none. */
  masteryOf: (index: number) => number;
  /** -1 for "not unlocked", then 0-based stage indices. */
  moduleStageOf: (index: number) => number;
  minElite?: number;
  minLevel?: number;
  minSkillLevel?: number;
  minMasteryOf?: (index: number) => number;
  minModuleStageOf?: (index: number) => number;
  onElite: (elite: number) => void;
  onLevel: (level: number) => void;
  onSkillLevel: (rank: number) => void;
  onMastery: (index: number, mastery: number) => void;
  onModuleStage: (index: number, stage: number) => void;
  /* What the skill or module actually DOES, at the level currently chosen.
     Optional: the roster's "where they are now" form has no use for it -- you
     are transcribing, not deciding -- while the plan's target form does, since
     picking M3 over M2 is a judgement about the effect. Where one is given the
     name becomes a button and the text opens under the row. */
  skillDescription?: (index: number) => React.ReactNode;
  moduleDescription?: (index: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [levelDraft, setLevelDraft] = useState<string | null>(null);
  const cap = maxLevelForElite(rarity, elite);
  const rankCap = maxSkillRankForElite(maxEliteForRarity(rarity));
  const unlock = moduleUnlock(rarity);

  /* Masteries need Elite 2 AND rank 7. Both from the gamedata rather than
     memory: every mastery row in character_table sits behind PHASE_2, and
     ranks 5-7 sit behind PHASE_1, so rank 7 alone is not enough. */
  const masteryOpen = maxEliteForRarity(rarity) === 2;
  /* Modules need Elite 2 and a level that depends on rarity -- 40, 50 or 60.
     A flat "E2 Lv40" would be wrong for two thirds of the roster. */
  const moduleOpen = !!unlock;


  return (
    <div className="state-blocks">
      {/* 1 -- Elite and level ------------------------------------------- */}
      <div className="state-block">
        <div className="state-block-head">
          <span className="label-pair">
            <span className="label-tag">Elite &amp; level</span>
          </span>
        </div>

        <div className="seg-row">
          {[0, 1, 2].map((e) => {
            const eliteCap = LEVEL_CAPS[rarity]?.[e as 0 | 1 | 2];
            if (eliteCap === undefined) return null;
            const below = e < minElite;
            return (
              <button
                type="button"
                key={e}
                className="seg"
                aria-pressed={elite === e}
                disabled={below}
                title={below ? `Below the promotion you have already recorded (E${minElite})` : `Elite ${e}`}
                onClick={() => onElite(e)}
              >
                <PromotionIcon elite={e} size={26} />

              </button>
            );
          })}
        </div>

        <div className="state-level">
          <label className="state-level-field"><span>LEVEL</span>
            {/* Keep an editable draft: an empty field is not level 1 until blur. */}
            <input
              type="number"
              inputMode="numeric"
              onFocus={(e) => { setLevelDraft(String(level)); e.currentTarget.select(); }}
              onClick={(e) => e.currentTarget.select()}
              className="state-level-number"
              aria-label="Level"
              value={levelDraft ?? String(level)}
              onChange={(e) => setLevelDraft(e.target.value)}
              onBlur={(e) => {
                const typed = Math.floor(Number(e.currentTarget.value));
                const next = Number.isFinite(typed) ? typed : 1;
                onLevel(Math.min(cap, Math.max(1, minLevel, next)));
                setLevelDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              }}
            />
          </label>
        <input
          type="range"
          className="planner-level-slider state-level-range"
          aria-label="Operator level"
          min={Math.max(1, minLevel)}
          max={cap}
          value={level}
          onChange={(e) => { setLevelDraft(null); onLevel(Number(e.target.value)); }}
        />
        <button type="button" className="state-level-max" aria-label={`Set level to maximum ${cap}`} title={`Set level to ${cap}`} onClick={() => { setLevelDraft(null); onLevel(cap); }}><small>MAX</small><span>{cap}</span></button>
        </div>
      </div>

      {/* 2 -- Skill level ----------------------------------------------- */}
      <div className={`state-block${skills.length === 0 ? ' locked' : ''}`}>
        <div className="state-block-head">
          <span className="label-pair">
            <span className="label-tag">Skill level</span>
          </span>
        </div>

        <div className="state-skill-slider">
          <input
            type="range"
            aria-label="Skill level"
            min={minSkillLevel}
            max={rankCap}
            step={1}
            value={skillLevel}
            disabled={skills.length === 0 || minSkillLevel >= rankCap}
            onChange={(e) => onSkillLevel(Number(e.target.value))}
          />
          <output aria-live="polite">{skillLevel}</output>
        </div>
        {skills.length === 0 && <span className="state-block-why">No skills</span>}

      </div>

      {/* 3 -- Masteries ------------------------------------------------- */}
      <div className={`state-block${masteryOpen ? '' : ' locked'}`}>
        <div className="state-block-head">
          <span className="label-pair">
            <span className="label-tag">Masteries</span>
          </span>
        </div>

        {skills.map((sk, i) => {
          const current = masteryOf(i);
          const floor = minMasteryOf?.(i) ?? 0;
          const key = `s${i}`;
          const label = sk.name || `Skill ${i + 1}`;
          const desc = skillDescription?.(i);
          return (
            <div key={i}>
              <div className="skill-row">
                {sk.icon && <Image src={sk.icon} alt="" width={28} height={28} />}
                <span className="name">
                  {desc ? (
                    <button
                      type="button"
                      className="state-row-name"
                      aria-expanded={open === key}
                      onClick={() => setOpen(open === key ? null : key)}
                    >
                      {label}
                    </button>
                  ) : label}
                </span>
                <span className="seg-row seg-row-compact">
                  {[1, 2, 3].map((m) => (
                    <button
                      type="button"
                      key={m}
                      className="seg"
                      aria-pressed={current === m}
                      disabled={!masteryOpen || m < floor}
                      onClick={() => onMastery(i, current === m ? floor : m)}
                    >
                      M{m}
                    </button>
                  ))}
                </span>
              </div>
              {open === key && <p className="planner-desc-text">{desc}</p>}
            </div>
          );
        })}

        {!masteryOpen && (
          <span className="state-block-why">
            No masteries
          </span>
        )}
      </div>

      {/* 4 -- Modules --------------------------------------------------- */}
      <div className={`state-block${moduleOpen && modules.length > 0 ? '' : ' locked'}`}>
        <div className="state-block-head">
          <span className="label-pair">
            <span className="label-tag">Modules</span>
          </span>
        </div>

        {modules.map((mod, i) => {
          const current = moduleStageOf(i);
          const floor = minModuleStageOf?.(i) ?? -1;
          const key = `m${i}`;
          const label = mod.name || `Module ${i + 1}`;
          const desc = moduleDescription?.(i);
          return (
            <div key={i}>
            <div className="skill-row">
              {mod.icon && <Image src={mod.icon} alt="" width={28} height={28} />}
              <span className="name">
                {desc ? (
                  <button
                    type="button"
                    className="state-row-name"
                    aria-expanded={open === key}
                    onClick={() => setOpen(open === key ? null : key)}
                  >
                    {label}
                  </button>
                ) : label}
              </span>
              <span className="seg-row seg-row-compact">
                {Array.from({ length: mod.stages }, (_, s) => (
                  <button
                    type="button"
                    key={s}
                    className="seg"
                    aria-pressed={current === s}
                    disabled={!moduleOpen || s < floor}
                    aria-label={`${label} level ${s + 1}`}
                    onClick={() => onModuleStage(i, current === s ? floor : s)}
                  >
                    {s + 1}
                  </button>
                ))}
              </span>
            </div>
            {open === key && <p className="planner-desc-text">{desc}</p>}
            </div>
          );
        })}

        {modules.length === 0 && <span className="state-block-why">No modules</span>}

      </div>
    </div>
  );
}
