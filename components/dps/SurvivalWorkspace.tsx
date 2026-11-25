import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { buildLabel, createBuild, profile, rankLabel, type Build, type Profile } from '@/lib/dps/calculator';
import { isHealingProfile } from '@/lib/dps/healing';
import { defenderStats, healerSkillCycle, patriotAttack, simulateSurvival, type ActiveDefense, type Defense, type PatriotPosition, type SurvivalHealer } from '@/lib/dps/survival';
import type { AttackType, Attacker, Defender, SurvivalRoster } from '@/lib/dps/survivalRoster';
import BuildEditor, { DamageSource } from './BuildEditor';
import BuildSearch from './BuildSearch';
import { fmt, Pick } from './ComparisonPlot';
import SurvivalPlot from './SurvivalPlot';
import css from './Dps.module.css';

interface DefenderBuild {
  operator: Defender;
  elite: number;
  level: number;
  potential: number;
  overrides: Partial<Pick<Defense, 'hp' | 'def' | 'res'>>;
  skill: number;
  rank: number;
  skillStart: number;
  cycle?: boolean;
}

const statLabels = { hp: 'Max HP', def: 'DEF', res: 'RES' } as const;
const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
const patriotTargets: { value: PatriotPosition; label: string }[] = [
  { value: 'melee', label: 'In melee range' }, { value: 'aura', label: 'In aura only' },
  { value: 'spear', label: 'High ground outside aura' }, { value: 'spear-aura', label: 'High ground in aura' },
];

function defenderSkill(build: DefenderBuild) {
  const choices = build.operator.skills?.filter(skill => skill.slot <= build.elite + 1) ?? [];
  const selected = choices.find(skill => skill.slot === build.skill);
  const ranks = Math.min([4, 7, 10][build.elite], selected?.ranks.length ?? 0);
  const rank = Math.min(ranks, build.rank);
  const effects = selected && { ...selected.ranks[rank - 1], name: selected.name, start: build.skillStart, cycle: build.cycle };
  return { choices, ranks, rank, selected, effects };
}

function SkillStart({ value, change, label }: { value: number; change: (value: number) => void; label: string }) {
  return (
    <label className={css.field}>
      Skill starts (s)
      <input type="number" min={0} max={120} step={0.1} value={value} aria-label={label}
        onChange={event => change(Math.min(120, Math.max(0, event.currentTarget.valueAsNumber || 0)))} />
    </label>
  );
}

function SkillTiming({ cycle, change, label }: { cycle?: boolean; change: (cycle: boolean) => void; label: string }) {
  return <Pick label={label} value={cycle ? 'cycle' : 'single'} options={[
    { value: 'single', label: 'One activation' }, { value: 'cycle', label: 'From deployment' },
  ]} change={value => change(value === 'cycle')} />;
}

function DefenderSkillControls({ build, update }: { build: DefenderBuild; update: (value: DefenderBuild) => void }) {
  const { choices, ranks, rank, selected, effects } = defenderSkill(build);
  if (!choices.length) return <small>{build.operator.skills?.length
    ? 'Promote this defender to unlock a modeled skill.' : 'No defender skills modeled for this operator.'}</small>;
  return (
    <div className={css.quickSource}>
      <Pick label="Defender skill" value={selected?.slot ?? 0} options={[
        { value: '0', label: 'No skill' },
        ...choices.map(skill => ({ value: String(skill.slot), label: `S${skill.slot} · ${skill.name}` })),
      ]} change={value => update({ ...build, skill: Number(value), rank: 10, skillStart: 0 })} />
      {effects && <>
        <div className={css.fields}>
          <Pick label="Defender skill rank" value={rank} options={numbers(ranks).map(value => ({ value: String(value), label: rankLabel(value) }))}
            change={value => update({ ...build, rank: Number(value) })} />
          {effects.sp && <SkillTiming label="Defender skill timing" cycle={build.cycle} change={cycle => update({ ...build, cycle })} />}
          {effects.duration !== null && !(effects.sp && build.cycle) && <SkillStart value={build.skillStart} label="Defender skill start (seconds)"
            change={skillStart => update({ ...build, skillStart })} />}
        </div>
        <small>{[
          effects.hp && `Max HP +${fmt(effects.hp * 100)}%`, effects.def && `DEF +${fmt(effects.def * 100)}%`,
          effects.res && `RES +${fmt(effects.res * 100)}%`, effects.regeneration && `${fmt(effects.regeneration)} HP/s self-healing`,
          effects.regenerationRatio && `${fmt(effects.regenerationRatio * 100)}% max HP/s self-healing`,
          effects.duration === null ? 'Always active' : `${effects.duration} s`,
        ].filter(Boolean).join(' · ')}</small>
      </>}
    </div>
  );
}

function DefenderSettings({ build, update }: { build: DefenderBuild; update: (value: DefenderBuild) => void }) {
  const { operator, elite, level, potential, overrides } = build;
  const base = defenderStats(operator, elite, level, potential);
  return (
    <details>
      <summary>Defender settings</summary>
      <div className={css.editor}>
        <div className={css.fields}>
          <Pick label="Defender promotion" value={elite} options={operator.stats.phases.map((phase, i) => ({
            label: 'Elite ' + phase.elite, value: String(i),
          }))} change={value => update({ ...build, elite: +value, level: operator.stats.phases[+value].maxLevel })} />
          <Pick label="Defender level" value={level} options={numbers(operator.stats.phases[elite].maxLevel)}
            change={value => update({ ...build, level: +value })} />
          {operator.potential.length > 0 && <Pick label="Defender potential" value={potential}
            options={numbers(operator.potential.length + 1)} change={value => update({ ...build, potential: +value })} />}
        </div>
        <small>Enter effective stats to include module bonuses or buffs. Clear a field to use the build’s base value.</small>
        <div className={css.fields}>
          {(Object.keys(statLabels) as (keyof typeof statLabels)[]).map(key => (
            <label key={key} className={css.field}>
              {statLabels[key]}
              <input type="number" step="any" min={key === 'hp' ? 1 : key === 'def' ? 0 : undefined} placeholder={String(base[key])}
                value={overrides[key] ?? ''} onChange={event => {
                  const value = event.currentTarget.valueAsNumber;
                  update({ ...build, overrides: { ...overrides, [key]: Number.isFinite(value) ? value : undefined } });
                }} />
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function SurvivalWorkspace({ profiles }: { profiles: Profile[] }) {
  const [data, setData] = useState<SurvivalRoster | 'error' | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    fetchAsset('/dps-survival.json').then(response => {
      if (!response.ok) throw new Error('Survival roster unavailable');
      return response.json() as Promise<SurvivalRoster>;
    }).then(roster => {
      if (current) setData(roster);
    }).catch(() => {
      if (current) setData('error');
    });
    return () => { current = false; };
  }, [retry]);

  const [enemy, setEnemy] = useState<Attacker>();
  const [enemyLevel, setEnemyLevel] = useState(0);
  const [attackType, setAttackType] = useState<AttackType>();
  const [enemySkillEnabled, setEnemySkillEnabled] = useState(true);
  const [stance, setStance] = useState<'marching' | 'ruination'>('marching');
  const [patriotTarget, setPatriotTarget] = useState<PatriotPosition>();
  const [defender, setDefender] = useState<DefenderBuild>();
  const [healers, setHealers] = useState<SurvivalHealer[]>([]);
  const nextHealer = useRef(1);
  const [duration, setDuration] = useState(30);
  const roster = data && data !== 'error' ? data : null;
  const enemyChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of roster?.enemies ?? []) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    return (roster?.enemies ?? []).map(e => ({
      id: e.id, name: e.name, code: e.code,
      detail: [e.code, counts.get(e.name)! > 1 ? e.id : null].filter(Boolean).join(' · '),
    }));
  }, [roster]);
  const operatorChoices = useMemo(() => (roster?.operators ?? [])
    .filter(operator => !healers.some(({ build }) => operator.id.endsWith('_' + build.operator)))
    .map(({ id, name }) => ({ id, name })), [roster, healers]);
  const healerChoices = useMemo(() => profiles.filter(p => isHealingProfile(p)
    && !defender?.operator.id.endsWith('_' + p.id) && !healers.some(({ build }) => build.operator === p.id))
    .map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)), [profiles, defender?.operator.id, healers]);

  const baseAttack = enemy?.levels.find(level => level.level === enemyLevel);
  const ability = baseAttack?.ability;
  const patriot = baseAttack?.patriot;
  const position = patriotTarget ?? (defender?.operator.ranged ? 'spear' : 'melee');
  const attack = useMemo(() => {
    if (!baseAttack || !attackType) return null;
    if (patriot) return patriotAttack(patriot, baseAttack.interval, stance, position);
    return { atk: baseAttack.atk, interval: baseAttack.interval, type: attackType,
      abilities: ability && enemySkillEnabled ? [ability] : [] };
  }, [baseAttack, attackType, patriot, stance, position, ability, enemySkillEnabled]);
  const skill = useMemo<ActiveDefense | undefined>(() => defender ? defenderSkill(defender).effects : undefined, [defender]);
  const defense = useMemo(() => {
    if (!defender) return null;
    const { operator, elite, level, potential, overrides } = defender;
    const base = defenderStats(operator, elite, level, potential);
    return {
      ...base,
      hp: Math.max(1, overrides.hp ?? base.hp),
      def: Math.max(0, overrides.def ?? base.def),
      res: overrides.res ?? base.res,
    };
  }, [defender]);
  const result = useMemo(() => attack && defense ? simulateSurvival(attack, defense, healers, duration, skill)
    : null, [attack, defense, healers, duration, skill]);

  if (!roster) return (
    <section className={css.panel}>
      <h2 className="section-title">Survival</h2>
      {data === 'error' ? <>
        <p>The survival roster could not load.</p>
        <button type="button" className="ghost btn-sm" onClick={() => { setData(null); setRetry(value => value + 1); }}>Retry</button>
      </> : <p role="status">Loading enemies and operators…</p>}
    </section>
  );

  function updateHealer(id: number, changes: Partial<SurvivalHealer>) {
    setHealers(previous => previous.map(entry => entry.build.id === id ? { ...entry, ...changes } : entry));
  }

  return (
    <div className={css.workspace}>
      <div className={css.left}>
        <section className={css.panel}>
          <div className={css.heading}>
            <h2 className="section-title">Matchup</h2>
            {result && <a className={'ghost btn-sm ' + css.chartJump} href="#survival-hp-chart">View HP chart</a>}
          </div>
          <div className={css.left}>
            <div>
              <h3>Enemy</h3>
              <BuildSearch label="Choose enemy" placeholder={enemy ? 'Change enemy…' : 'Search enemy name or code…'} choices={enemyChoices}
                pick={id => {
                  const chosen = roster.enemies.find(e => e.id === id)!;
                  setEnemy(chosen);
                  setEnemyLevel(chosen.levels[0].level);
                  setAttackType(chosen.types.length === 1 ? chosen.types[0] : undefined);
                  setEnemySkillEnabled(true);
                  setStance('marching');
                  setPatriotTarget(undefined);
                }} />
              {enemy && baseAttack && <div className={css.editor}>
                <strong>{enemy.name}{enemy.code ? ' · ' + enemy.code : ''}</strong>
                <small>Lv {enemyLevel} · {fmt(attack?.atk ?? baseAttack.atk)} ATK
                  {(attack?.basicHits ?? 1) > 0 && ` · ${attack?.basicHits === 4 ? '4 hits every ' : '1 hit every '}${fmt(attack?.interval ?? baseAttack.interval)} s`}
                  {attackType ? ' · ' + attackType : ''}</small>
                <div className={css.fields}>
                  {enemy.levels.length > 1 && <Pick label="Attacker level" value={enemyLevel}
                    options={enemy.levels.map(row => ({ label: 'Lv ' + row.level, value: String(row.level) }))}
                    change={value => setEnemyLevel(+value)} />}
                  {enemy.types.length > 1 && <Pick label="Basic attack damage type" value={attackType ?? ''}
                    options={[{ value: '', label: 'Choose damage type' }, ...enemy.types]}
                    change={value => setAttackType(value ? value as AttackType : undefined)} />}
                </div>
                {patriot ? <div className={css.quickSource}>
                  <Pick label="Patriot stance" value={stance} options={[
                    { value: 'marching', label: 'Marching Stance' }, { value: 'ruination', label: 'Ruination Stance' },
                  ]} change={value => setStance(value as 'marching' | 'ruination')} />
                  {stance === 'marching' ? <small>Models a defender blocking Patriot. DEF applies to each hit.</small> : <>
                    <Pick label="Defender position" value={position} options={patriotTargets}
                      change={value => setPatriotTarget(value as PatriotPosition)} />
                    {position.startsWith('spear') && <small>The defender is the farthest eligible high-ground target.</small>}
                  </>}
                </div> : ability ? <div className={css.quickSource}>
                  <Pick label="Enemy skill" value={enemySkillEnabled ? 'on' : 'off'} options={[
                    { value: 'on', label: ability.name }, { value: 'off', label: 'Basic attacks only' },
                  ]} change={value => setEnemySkillEnabled(value === 'on')} />
                  {enemySkillEnabled && <small>{fmt(ability.scale * 100)}% ATK · {ability.type} · {fmt(ability.cooldown)} s cooldown</small>}
                </div> : <small>Basic attacks only.</small>}
              </div>}
            </div>
            <div>
              <h3>Defending operator</h3>
              <BuildSearch label="Choose defender" placeholder={defender ? 'Change defender…' : 'Search operators…'} choices={operatorChoices}
                pick={id => {
                  const operator = roster.operators.find(op => op.id === id)!;
                  const elite = operator.stats.phases.length - 1;
                  setDefender({ operator, elite, level: operator.stats.phases[elite].maxLevel, potential: 1, overrides: {}, skill: 0, rank: 10, skillStart: 0 });
                }} />
              {defender && defense && <div className={css.editor}>
                <strong>{defender.operator.name}</strong>
                <small>{fmt(defense.hp)} HP · {fmt(defense.def)} DEF · {fmt(defense.res)} RES</small>
                {defense.blocksDirectHealing && <small>This defender can receive regeneration. Direct heals have no effect.</small>}
                <DefenderSkillControls build={defender} update={setDefender} />
                <DefenderSettings build={defender} update={setDefender} />
              </div>}
            </div>
          </div>
        </section>

        <section className={css.panel}>
          <h2 className="section-title">Healers</h2>
          {healerChoices.length > 0 && <BuildSearch label="Add healer" placeholder="Search healers…" choices={healerChoices}
            pick={id => {
              const build = createBuild(profiles.find(p => p.id === id)!, nextHealer.current++);
              setHealers(previous => [...previous, { build, delay: 0 }]);
            }} />}
          {!healers.length && <small>Optional. Add a healer to compare against the defender alone.</small>}
          {healers.map(({ build: b, delay, cycle }) => (
            <article className={css.build} key={b.id} aria-label={profile(b).name} style={{ borderColor: 'var(--line)' }}>
              <div className={css.heading}>
                <strong>{profile(b).name}</strong>
                <button type="button" className="ghost btn-sm" aria-label={'Remove ' + profile(b).name}
                  onClick={() => setHealers(previous => previous.filter(entry => entry.build.id !== b.id))}>Remove</button>
              </div>
              <DamageSource b={b} survival update={(build: Build) => updateHealer(b.id, { build })} />
              <details className={css.editor}>
                <summary>Edit healer</summary>
                <small>{buildLabel(b)}{b.skill && delay && !cycle ? ' · Starts at ' + fmt(delay) + ' s' : ''}</small>
                <BuildEditor b={b} survival hideSource cycle={cycle} update={build => updateHealer(b.id, { build })} />
                {b.skill > 0 && <div className={css.fields}>
                  {healerSkillCycle(b) && <SkillTiming label={profile(b).name + ' skill timing'} cycle={cycle}
                    change={value => updateHealer(b.id, { cycle: value })} />}
                  {(!cycle || !healerSkillCycle(b)) && <SkillStart value={delay} label={'Skill start for ' + profile(b).name + ' (seconds)'}
                    change={value => updateHealer(b.id, { delay: value })} />}
                </div>}
              </details>
            </article>
          ))}
        </section>
      </div>
      <div className={css.right}>
        <SurvivalPlot result={result} duration={duration} setDuration={setDuration}
          hasHealers={healers.length > 0} missing={enemy && !attackType ? 'Choose the enemy’s attack damage type.' : 'Choose an enemy and a defending operator to plot HP.'} />
        <details className={css.panel}>
          <summary>Simulation assumptions</summary>
          <p>The defender starts at full HP and healers stay in range. From deployment uses initial SP, then charges 1 SP per second and activates the skill as soon as it is ready. SP does not recover during the active window. One activation assumes the skill is ready at its chosen time.</p>
          <p>The model uses game-data cooldowns and simplified attack timing. Stage modifiers, transitions between enemy phases, SP bonuses, shields, healer buffs and triggered heals are excluded. A lethal hit resolves before healing at the same time.</p>
        </details>
      </div>
    </div>
  );
}
