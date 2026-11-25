import { fetchAsset } from '@/lib/assets/assetRetry';
import { withContentPage } from '@/lib/content/server';
import { Fragment, useMemo, useRef, useState, type RefObject } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import PageMeta from '@/components/layout/PageMeta';
import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import ComparisonPlot, { color, fmt, Pick } from '@/components/dps/ComparisonPlot';
import {
  buildLabel,
  calculate,
  createBuild as buildFromProfile,
  type Profile,
  profile,
  selectedModule,
  rankLabel,
  type Build,
  type Target,
  initialTarget,
  threshold,
  burstThreshold,
} from '@/lib/dps/calculator';
import { firstBurst, fallout } from '@/lib/dps/breakpoints';
import BuildSearch from '@/components/dps/BuildSearch';
import BuildEditor, { DamageSource } from '@/components/dps/BuildEditor';
import SurvivalWorkspace from '@/components/dps/SurvivalWorkspace';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import type { EnemyPreset, EnemyLevel } from '@/lib/dps/enemyTargets';
import { deploymentSequence } from '@/lib/dps/deployment';
import { targetControls } from '@/lib/dps/controls';
import { damageBasis, dpsLabel } from '@/lib/dps/damageLabels';
import css from '@/components/dps/Dps.module.css';

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
function BuildDetails({ b, target }: { b: Build; target: Target }) {
  const r = calculate(b, target),
    burst = fallout(r.element, target);
  return (
    <div className={css.breakdown}>
      <p>
        {r.source} · {fmt(r.sourceAtk)} source ATK
        {r.interval !== null && <> · repeats every {fmt(r.interval)} s</>}
      </p>
      <dl>
        {Object.entries(r.components)
          .filter(([, v]) => v > 0)
          .map(([key, v]) => (
            <div key={key}>
              <dt>{key} damage {damageBasis(r)}</dt>
              <dd>{fmt(v)}</dd>
            </div>
          ))}
        {r.element && (
          <div>
            <dt>{r.element} buildup {damageBasis(r)}</dt>
            <dd>{fmt(r.injury)}</dd>
          </div>
        )}
        {r.splash > 0 && (
          <div>
            <dt>Adjacent target injury {damageBasis(r)}</dt>
            <dd>{fmt(r.splash)}</dd>
          </div>
        )}
        {r.periodic > 0 && (
          <div>
            <dt>Additional injury / second</dt>
            <dd>{fmt(r.periodic)}</dd>
          </div>
        )}
        {r.empowered && (
          <div>
            <dt>Empowered hits</dt>
            <dd>
              {r.empowered.hits} × {fmt(r.empowered.damagePerHit)} HP · {fmt(r.empowered.injuryPerHit)} injury
              each
            </dd>
          </div>
        )}
        {r.summon && (
          <div>
            <dt>Blood’s Whisper · full summon ({r.summon.ticks} ticks)</dt>
            <dd>
              {fmt(r.summon.damage)} Arts damage · {fmt(r.summon.injury)} potential injury
            </dd>
          </div>
        )}
        {burst && (
          <div>
            <dt>Enemy fallout · full duration</dt>
            <dd>
              {burst.count} × {fmt(burst.perHit)} elemental HP
            </dd>
          </div>
        )}
        {r.element === 'Rampage' && (
          <div>
            <dt>Enemy fallout · 15 s</dt>
            <dd>
              Ramps to 2,110 elemental damage per second before resistance.
            </dd>
          </div>
        )}
        {r.effects.map((e) => (
          <div key={e.label}>
            <dt>
              {e.label}
              <small>{e.condition}</small>
            </dt>
            <dd>
              {fmt(e.amount)} {e.type}
            </dd>
          </div>
        ))}
      </dl>
      {r.note && <p>{r.note}</p>}
    </div>
  );
}
function DamageComposition({ builds, target }: { builds: Build[]; target: Target }) {
  const palette = {
    Physical: 'var(--amber)',
    Arts: 'var(--rarity-4)',
    True: 'var(--text-bright)',
    Elemental: 'var(--teal)',
  };
  const rows = builds.map((b, index) => ({ b, index, result: calculate(b, target) }))
    .filter(({ result }) => result.hps === null || result.damage > 0);
  const max = Math.max(1, ...rows.map((row) => row.result.damage));
  return (
    <details className={css.panel}>
      <summary>Damage by type</summary>
      {rows.map(({ b, result, index }) => (
        <div key={b.id} className={css.composition}>
          <strong>
            #{index + 1} {profile(b).name}
          </strong>
          <small>{fmt(result.damage)} total damage {damageBasis(result)} · {result.source}</small>
          <div className={css.bar} aria-hidden="true">
            {Object.entries(palette).map(([type, background]) => (
              <i
                key={type}
                style={{
                  background,
                  width: (100 * result.components[type as keyof typeof palette]) / max + '%',
                }}
              />
            ))}
          </div>
          {result.damage > 0 && <small>
            {Object.entries(result.components)
              .filter(([, v]) => v > 0)
              .map(([type, v]) => fmt(v) + ' ' + type.toLowerCase())
              .join(' · ')}
          </small>}
        </div>
      ))}
    </details>
  );
}

function HealingBreakdown({ builds, results }: { builds: Build[]; results: ReturnType<typeof calculate>[] }) {
  const rows = results.flatMap((result, index) => result.healing ? [{ healing: result.healing, index }] : []);
  if (!rows.length) return null;
  return (
    <section className={css.panel}>
      <h2 className="section-title">Healing breakdown</h2>
      <div className={`${css.scroll} sidescroll`}>
        <table>
          <thead>
            <tr><th>Build</th><th>Direct heal</th><th>Regen per second</th><th>HPS per ally</th></tr>
          </thead>
          <tbody>
            {rows.map(({ healing, index }) => {
              const b = builds[index];
              return (
                <Fragment key={b.id}>
                  <tr className={healing.note || healing.conditional ? css.healingWithNotes : undefined}>
                    <th scope="row">#{index + 1} {profile(b).name} {b.skill ? 'S' + b.skill : ''}</th>
                    <td>
                      {healing.direct ? <>
                        {fmt(healing.direct.amount)} per heal
                        <small>Every {fmt(healing.direct.interval)} s · up to {healing.direct.targets} {healing.direct.targets === 1 ? 'ally' : 'allies'}</small>
                      </> : '—'}
                    </td>
                    <td>{healing.regeneration ? fmt(healing.regeneration) : '—'}</td>
                    <td>{healing.hps === null ? '—' : fmt(healing.hps)}</td>
                  </tr>
                  {(healing.note || healing.conditional) && (
                    <tr>
                      <td colSpan={4}>
                        {healing.note && <small>{healing.note}</small>}
                        {healing.conditional && (
                          <small>{healing.conditional.label} · {fmt(healing.conditional.amount)} per pop</small>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Deployment({
  builds,
  target,
  roster,
  timelineRef,
}: {
  builds: Build[];
  target: Target;
  roster: Profile[];
  timelineRef: RefObject<HTMLTableElement | null>;
}) {
  const ss = builds.filter((b) => b.operator === 'svash2' && b.skill === 2);
  const [added, setAdded] = useState<Build[]>([]);
  const nextAlly = useRef(-1);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [firstAttack, setFirstAttack] = useState<number | null>(null);
  const allies = [...builds.filter((b) => b.operator !== 'svash2'), ...added];
  const [fullRoster, setFullRoster] = useState<Profile[]>([]);
  const [loadError, setLoadError] = useState(false);
  const loading = useRef(false);
  async function loadAllies() {
    if (loading.current || fullRoster.length) return;
    loading.current = true;
    setLoadError(false);
    try {
      const response = await fetchAsset('/dps-deployment-allies.json');
      if (!response.ok) throw new Error('Roster unavailable');
      setFullRoster(await response.json());
    } catch {
      setLoadError(true);
    } finally {
      loading.current = false;
    }
  }
  const allProfiles = useMemo(() => {
    const byId = new Map(fullRoster.map((p) => [p.id, p]));
    for (const p of roster) byId.set(p.id, p);
    return [...byId.values()];
  }, [fullRoster, roster]);
  const choices = useMemo(
    () =>
      allProfiles
        .filter((p) => p.id !== 'svash2')
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allProfiles],
  );
  const [owner, setOwner] = useState(0),
    [ally, setAlly] = useState(0),
    [stacks, setStacks] = useState(2),
    [delay, setDelay] = useState(0);
  const s = ss.find((b) => b.id === owner) ?? ss[0],
    a = allies.find((b) => b.id === ally) ?? allies[0];
  if (!s) return null;
  const maxStacks = profile(s).skills.find((x) => x.slot === 2)!.ranks[s.rank - 1].max_stack_cnt;
  const label = (b: Build) => (b.id < 0 ? 'Ally ' + (added.indexOf(b) + 1) : '#' + (builds.indexOf(b) + 1));
  const opts = (bs: Build[]) =>
    bs.map((b) => ({ value: String(b.id), label: label(b) + ' ' + profile(b).name }));
  return (
    <details
      className={css.panel}
      onToggle={(e) => {
        if (e.currentTarget.open) void loadAllies();
      }}
    >
      <summary>Deployment timeline · SilverAsh the Reignfrost S2</summary>
      <p>
        Each stored strike uses the marked ally’s ATK when it lands. This scenario assumes the ally was left
        of the Eye when marked and the target stays in range.
      </p>
      <div className={css.add}>
        <BuildSearch
          label="Add timeline ally"
          placeholder="Search all operators…"
          choices={choices}
          pick={(id) => {
            const build = buildFromProfile(allProfiles.find((p) => p.id === id)!, nextAlly.current--);
            setAdded((prev) => [...prev, build]);
            setAlly(build.id);
          }}
        />
      </div>
      {loadError && (
        <p role="status">
          Couldn’t load the full ally roster.{' '}
          <button className="btn btn-sm" onClick={loadAllies}>
            Retry
          </button>
        </p>
      )}
      {a && (
        <>
          <div className={css.controls}>
            <Pick label="SilverAsh build" value={s.id} options={opts(ss)} change={(v) => setOwner(+v)} />
            <Pick label="Ally build" value={a.id} options={opts(allies)} change={(v) => setAlly(+v)} />
            <Pick
              label="Stored casts"
              value={Math.min(stacks, maxStacks)}
              options={range(0, maxStacks)}
              change={(v) => setStacks(+v)}
            />
            {profile(a).skills.find((x) => x.slot === a.skill)?.manual && (
              <Pick
                label={'Activate S' + a.skill + ' after deploy (s)'}
                value={delay}
                options={[0, 0.9, 1.1, 1.5, 5]}
                change={(v) => setDelay(+v)}
              />
            )}
          </div>
          {a.id < 0 && (
            <details key={a.id}>
              <summary>Edit {profile(a).name} build</summary>
              <BuildEditor
                b={a}
                update={(updated) => setAdded((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))}
              />
              <button
                className="btn btn-sm"
                onClick={() => setAdded((prev) => prev.filter((b) => b.id !== a.id))}
              >
                Remove ally
              </button>
            </details>
          )}
          {a.operator === 'phatom' && a.skill === 2 && (
            <div className={css.controls}>
              <Pick
                label="Phantom’s first attack after deployment"
                value={firstAttack ?? 'none'}
                options={[
                  { value: 'none', label: 'No attacks before strikes' },
                  ...[0, 0.5, 1, 1.2, 1.4].map((v) => ({ value: String(v), label: v + ' s' })),
                ]}
                change={(v) => setFirstAttack(v === 'none' ? null : +v)}
              />
            </div>
          )}
          <details key={'atk-' + a.id} open={!profile(a).skills.length || undefined}>
            <summary>Custom ally ATK</summary>
            <label className={css.field}>
              Ally ATK at impact
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Auto"
                value={overrides[a.id] ?? ''}
                onChange={(e) => setOverrides({ ...overrides, [a.id]: e.target.value })}
              />
            </label>
            <small>
              Enter the ally’s in-game ATK to include other buffs. Leave blank to use the calculated ATK.
            </small>
          </details>
          <table
            ref={timelineRef}
            aria-label={
              'Deployment · #' +
              (builds.indexOf(s) + 1) +
              ' ' +
              profile(s).name +
              ' S2 with ' +
              label(a) +
              ' ' +
              profile(a).name +
              (a.skill ? ' S' + a.skill + ' ' + rankLabel(a.rank) : '') +
              ' · ' +
              Math.min(stacks, maxStacks) +
              ' stored casts'
            }
          >
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Ally ATK</th>
                <th>HP damage</th>
              </tr>
            </thead>
            <tbody>
              {deploymentSequence(
                s,
                a,
                target,
                stacks,
                delay,
                firstAttack,
                overrides[a.id] ? Math.max(0, Number(overrides[a.id])) : null,
              ).map((e) => (
                <tr key={e.label}>
                  <td>{fmt(e.time)} s</td>
                  <td>{e.label}</td>
                  <td>{fmt(e.atk)}</td>
                  <td>{e.damage ? fmt(e.damage) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {a.operator === 'phatom' &&
              a.skill === 2 &&
              'Each of Phantom’s attacks spends one Bloody Opus charge. Stored strikes use the remaining bonus. '}
            Manual skills wait for sufficient SP at 1 SP/s. At the same timestamp, activation precedes the
            strike. Other allies use their deployment ATK unless an activation is shown. Ulpianus’s anchor
            travel hit is separate.
          </p>
        </>
      )}
    </details>
  );
}
interface CalculatorProps {
  profiles: Profile[];
  dataSource: string;
  enemies?: EnemyPreset[];
}

const modes = [
  { value: 'comparison', label: 'Damage & healing' },
  { value: 'survival', label: 'Survival' },
] as const;
const modeId = 'calculator-mode';

export default function DpsCalculator(props: CalculatorProps) {
  const [mode, setMode] = useState<(typeof modes)[number]['value']>('comparison');
  const [visitedSurvival, setVisitedSurvival] = useState(false);
  const hold = useSwitchHold(modeId);
  return (
    <>
      <PageMeta title="DPS Calculator" path="/dps-calculator"
        description="Compare operator damage, healing and elemental burst timing, or test survival against an enemy." />
      <PageHeader title="DPS Calculator" eyebrow="Tools // Combat analysis" slim />
      <main className={css.page}>
        <Tabs id={modeId} label="Calculator mode" options={modes} value={mode} onChange={value => {
          if (value === mode) return;
          hold.capture();
          if (value === 'survival') setVisitedSurvival(true);
          setMode(value);
        }} />
        <div ref={hold.ref} style={hold.style}>
          <div {...tabPanelProps(modeId, 'comparison')} hidden={mode !== 'comparison'} className={css.modePanel}>
            <DamageComparison {...props} />
          </div>
          <div {...tabPanelProps(modeId, 'survival')} hidden={mode !== 'survival'} className={css.modePanel}>
            {visitedSurvival && <SurvivalWorkspace profiles={props.profiles} />}
          </div>
        </div>
      </main>
    </>
  );
}

function DamageComparison({ profiles, dataSource, enemies = [] }: CalculatorProps) {
  const createBuild = (id: string, number: number) =>
    buildFromProfile(profiles.find((p) => p.id === id)!, number);
  const pickOps = useMemo(
    () =>
      [...profiles]
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map((p) => ({
          id: p.id,
          name: p.name,
          detail: p.region === 'CN' ? 'CN' : undefined,
        })),
    [profiles],
  );
  const pickEnemies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of enemies) {
      const key = e.name + '/' + e.code;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return enemies.map((e) => ({
      id: e.id,
      name: e.name,
      code: e.code,
      detail: [e.code, e.levels[0].tier, counts.get(e.name + '/' + e.code)! > 1 ? e.id : '']
        .filter(Boolean)
        .join(' · '),
    }));
  }, [enemies]);
  const [enemy, setEnemy] = useState<EnemyPreset | null>(null);
  const [level, setLevel] = useState(0);
  const [builds, setBuilds] = useState<Build[]>([]),
    [edit, setEdit] = useState<number | null>(null);
  const [baselineChoice, setBaseline] = useState<number>();
  const timelineRef = useRef<HTMLTableElement>(null);
  const next = useRef(1),
    [targetInput, setTarget] = useState<Target>(initialTarget);
  const capabilities = useMemo(() => targetControls(builds), [builds]);
  const target = useMemo(() => targetInput.burst === 'None' || capabilities.bursts.includes(targetInput.burst)
    ? targetInput : { ...targetInput, burst: 'None' }, [targetInput, capabilities]);
  const baselineId = builds.some(build => build.id === baselineChoice) ? baselineChoice! : builds[0]?.id;
  const targetName = enemy ? [enemy.name, enemy.code, 'Lv ' + level].filter(Boolean).join(' · ') : 'Custom target';
  const targetResults = useMemo(() => builds.map(build => calculate(build, target)), [builds, target]);
  const hasDamageSource = targetResults.some(result => result.hps === null || result.damage > 0);
  const openingResults = useMemo(() => target.burst === 'None'
    ? targetResults : builds.map(build => calculate(build, { ...target, burst: 'None' })), [builds, target, targetResults]);
  const hasBuildup = (result: (typeof openingResults)[number]) =>
    result.injury > 0 || (result.summon?.injury ?? 0) > 0;
  function selectEnemy(preset: EnemyPreset, row: EnemyLevel) {
    setEnemy(preset);
    setLevel(row.level);
    setTarget({
      ...initialTarget,
      tier: row.tier,
      def: row.def,
      res: row.res,
      injuryRes: row.injuryRes,
      elementalRes: row.elementalRes,
    });
  }
  function add(items: Build[]) {
    if (!items.length) return;
    setBuilds((prev) => [...prev, ...items]);
  }
  const update = (value: Build) => setBuilds(previous => previous.map(build => build.id === value.id ? value : build));
  const tiers = ['Grunt', 'Elite', 'Boss'] as const;
  const columns = enemy || target.thresholdOverride ? [target.tier] : tiers;
  return (
    <>
        <div className={css.workspace}>
          <div className={css.left}>
            <section className={css.panel}>
              <div className={css.heading}>
                <h2 className="section-title">Builds</h2>
                <div className={css.controls}>
                  <small>100% trust</small>
                  {builds.length > 0 && <a className={'ghost btn-sm ' + css.chartJump} href="#damage-comparison">View chart</a>}
                </div>
              </div>
              <div className={css.add}>
                <BuildSearch
                  label="Add operator"
                  placeholder="Search operators…"
                  choices={pickOps}
                  pick={(id) => add([createBuild(id, next.current++)])}
                />
              </div>
              {builds.map((b, index) => (
                <article key={b.id} className={css.build} style={{ borderLeftColor: color(index) }}>
                  <div className={css.row}>
                    <Image src={getOperatorIconPath(profile(b))} alt="" width={48} height={48} />
                    <div>
                      <strong>{profile(b).name}</strong>
                      <small>
                        #{index + 1} · {buildLabel(b)}
                      </small>
                    </div>
                  </div>
                  <div className={css.quickSource}><DamageSource b={b} update={update} /></div>
                  <div className={css.actions}>
                    <button
                      className="ghost btn-sm"
                      aria-expanded={edit === b.id}
                      onClick={() => setEdit(edit === b.id ? null : b.id)}
                    >
                      {edit === b.id ? 'Close settings' : 'Edit build'}
                    </button>
                    <button className="ghost btn-sm" onClick={() => add([{ ...b, id: next.current++ }])}>
                      Duplicate
                    </button>
                    <button
                      className="ghost btn-sm"
                      onClick={() => setBuilds((prev) => prev.filter((x) => x.id !== b.id))}
                    >
                      Remove
                    </button>
                    {builds.length > 1 && (
                      <button type="button" className="filter-chip" aria-pressed={baselineId === b.id}
                        onClick={() => setBaseline(b.id)}>Baseline</button>
                    )}
                  </div>
                  {edit === b.id && (
                    <BuildEditor
                      b={b}
                      update={update}
                      hideSource
                    />
                  )}
                </article>
              ))}
            </section>
            {(!builds.length || hasDamageSource) && <section className={css.panel}>
              <div className={css.heading}>
                <h2 className="section-title">Target</h2>
                <strong>
                  {enemy ? [enemy.name, enemy.code].filter(Boolean).join(' · ') : 'Custom target'}
                </strong>
              </div>
              {enemies.length > 0 && (
                <BuildSearch
                  label="Find enemy"
                  placeholder="Enemy name or code…"
                  choices={pickEnemies}
                  pick={(id) => {
                    const preset = enemies.find((e) => e.id === id)!;
                    selectEnemy(preset, preset.levels[0]);
                  }}
                />
              )}
              {enemy && (
                <div className={css.preset}>
                  <small>Base combat stats · {enemy.levels.find((l) => l.level === level)?.tier}</small>
                  {enemy.levels.length > 1 && (
                    <Pick
                      label="Enemy level"
                      value={level}
                      options={enemy.levels.map((l) => l.level)}
                      change={(v) => selectEnemy(enemy, enemy.levels.find((l) => l.level === +v)!)}
                    />
                  )}
                  <button className="btn btn-sm" onClick={() => setEnemy(null)}>
                    Customize
                  </button>
                </div>
              )}
              <div className={css.controls}>
                {(['def', 'res', 'elementalRes', 'injuryRes'] as const).map((key, i) => capabilities.defenses.has(key) && (
                  <label key={key} className={css.field}>
                    {['DEF', 'RES', 'Elemental RES', 'Injury resistance'][i]}
                    <input
                      type="number"
                      min="0"
                      readOnly={!!enemy}
                      max={i ? 100 : undefined}
                      value={target[key]}
                      onChange={(e) =>
                        setTarget(previous => ({
                          ...previous,
                          [key]: Math.min(i ? 100 : Infinity, Math.max(0, Number(e.target.value))),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              {builds.length > 0 && capabilities.defenses.size === 0 && (
                <small>The selected sources do not use target defenses.</small>
              )}
              {(capabilities.bursts.length > 0 || capabilities.buildup) && (
                <details className={css.chartSettings}>
                  <summary>Elemental scenario</summary>
                  <div className={css.controls}>
                    {capabilities.buildup && !enemy && (
                      <Pick label="Enemy tier" value={target.tier} options={[...tiers]}
                        change={value => setTarget(previous => ({ ...previous, tier: value as Target['tier'], thresholdOverride: undefined }))} />
                    )}
                    {capabilities.buildup && (
                      <label className={css.field}>
                        Burst threshold
                        <input type="number" min={1} max={10000} readOnly={!!enemy}
                          placeholder={String(threshold(target.tier))}
                          value={enemy ? burstThreshold(target) : (target.thresholdOverride ?? '')}
                          onChange={event => {
                            const n = event.currentTarget.valueAsNumber;
                            setTarget(previous => ({ ...previous, thresholdOverride: Number.isFinite(n) ? Math.min(10000, Math.max(1, n)) : undefined }));
                          }} />
                      </label>
                    )}
                    {capabilities.bursts.length > 0 && (
                      <Pick label="Active burst" value={target.burst} options={['None', ...capabilities.bursts]}
                        change={burst => setTarget(previous => ({ ...previous, burst }))} />
                    )}
                  </div>
                </details>
              )}
              {(enemy || targetInput !== initialTarget) && (
                <button type="button" className="ghost btn-sm" onClick={() => { setEnemy(null); setTarget(initialTarget); }}>
                  Reset target
                </button>
              )}
            </section>}
          </div>
          <div className={css.right}>
            {!builds.length ? (
              <section className={css.panel}>
                <h2 className="section-title">Build comparison</h2>
                <p>Add an operator to compare damage or healing.</p>
              </section>
            ) : (
              <>
                <ComparisonPlot
                  timelineRef={timelineRef}
                  targetName={targetName}
                  builds={builds}
                  target={target}
                  baselineId={baselineId}
                />
                {hasDamageSource && <section className={css.panel}>
                  <h2 className="section-title">Damage breakdown</h2>
                  <div className={css.scroll}>
                    <table>
                      <thead>
                        <tr>
                          <th>Build and damage source</th>
                          <th>Damage</th>
                          <th>{dpsLabel(builds)}</th>
                          {capabilities.buildup && <><th>Injury buildup</th><th>Injury per second</th></>}
                        </tr>
                      </thead>
                      <tbody>
                        {builds.map((b, index) => {
                          const r = targetResults[index];
                          if (r.hps !== null && r.damage === 0) return null;
                          return (
                            <tr key={b.id}>
                              <th>
                                <details>
                                  <summary>
                                    #{index + 1} {profile(b).name} · {r.source}
                                  </summary>
                                  <BuildDetails b={b} target={target} />
                                </details>
                              </th>
                              <td>{fmt(r.damage)}<small>{damageBasis(r)}</small></td>
                              <td>{fmt(r.dps)}</td>
                              {capabilities.buildup && <>
                                <td>{fmt(r.injury)}<small>{damageBasis(r)}</small></td><td>{fmt(r.injuryRate)}</td>
                              </>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <small>
                    Damage sums all modeled hits in the listed attack, tick or use against one enemy.
                    DPS averages repeating damage while the source is active. A single cast or trigger shows its damage total.
                  </small>
                </section>}
                <HealingBreakdown builds={builds} results={targetResults} />
              </>
            )}
          </div>
        </div>
        {openingResults.some(hasBuildup) && (
          <section className={css.panel}>
            <h2 className="section-title">Elemental burst timing</h2>
            {columns.length === 1 && (
              <small>
                {[enemy?.name, target.tier, fmt(burstThreshold(target)) + ' injury to burst']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
            <div className={css.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    {columns.length === 1
                      ? ['Injury', 'To burst', 'First burst', 'Recovery', 'Next burst interval'].map(
                          (label) => <th key={label}>{label}</th>,
                        )
                      : columns.map((t) => (
                          <th key={t}>
                            {enemy ? enemy.name + ' · ' : ''}
                            {t} · {fmt(burstThreshold({ ...target, tier: t }))}
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody>
                  {builds.flatMap((b, index) => {
                    const action = openingResults[index];
                    if (!hasBuildup(action)) return [];
                    const equipped = selectedModule(b);
                    const eliteScale = equipped?.name === 'RIT-X'
                      ? equipped.stages[b.stage - 1]?.trait.ep_damage_scale
                      : undefined;
                    const amountLabel = damageBasis(action);
                    const sources: ('build' | 'summon')[] =
                      action.summon && !b.plotSummon ? ['build', 'summon'] : ['build'];
                    return sources.map((source) => (
                      <tr key={b.id + source}>
                        <th>
                          #{index + 1} {profile(b).name}{' '}
                          {b.skill > 0 ? 'S' + b.skill + ' ' + rankLabel(b.rank) : ''}
                          <small>{source === 'summon' ? 'Blood’s Whisper' : action.source}</small>
                          {eliteScale && eliteScale > 1 && (
                            <small>RIT-X · +{fmt((eliteScale - 1) * 100)}% injury against Elites and Bosses</small>
                          )}
                        </th>
                        {columns.map((tier) => {
                          const r = firstBurst(b, { ...target, tier }, source);
                          if (columns.length === 1) {
                            const seconds = (time: number | null) => (time === null ? '—' : fmt(time) + ' s');
                            return (
                              <Fragment key={tier}>
                                <td>
                                  {fmt(r.amount)} <small>{r.summon ? 'per summon' : amountLabel}</small>
                                </td>
                                <td>
                                  {r.count ? r.count + ' ' + r.unit : r.limited ? 'Below threshold' : '—'}
                                </td>
                                <td>{seconds(r.seconds)}</td>
                                <td>{seconds(r.recovery)}</td>
                                <td>
                                  {r.limited && r.seconds !== null && r.repeat === null
                                    ? 'One burst this window'
                                    : seconds(r.repeat)}
                                </td>
                              </Fragment>
                            );
                          }
                          return (
                            <td key={tier}>
                              {r.count ? r.count + ' ' + r.unit : r.limited ? 'Below threshold' : '—'}
                              <small>
                                {fmt(r.amount)} injury {r.summon ? 'per summon' : amountLabel}
                              </small>
                              {r.seconds !== null && (
                                <small>
                                  First at {fmt(r.seconds)} s
                                  {r.repeat !== null && ' · next in ' + fmt(r.repeat) + ' s'}
                                </small>
                              )}
                              {r.recovery !== null && (
                                <small>
                                  {fmt(r.recovery)} s recovery
                                  {r.repeat === null && r.limited ? ' · no second burst this window' : ''}
                                </small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
            <small>
              Time starts at the first hit or tick with an empty gauge. Each source acts alone on a surviving
              target. The interval to the next burst includes recovery and rebuilding the gauge.
              Retaliations and other external triggers show the required count when their timing depends on another actor.
            </small>
          </section>
        )}
        {hasDamageSource && <DamageComposition builds={builds} target={target} />}
        <Deployment timelineRef={timelineRef} builds={builds} target={target} roster={profiles} />
        <details className={css.panel}>
          <summary>Formulas and coverage</summary>
          <p>
            Physical hits subtract DEF. Arts and elemental HP damage scale with their respective resistances.
            Each has a 5% floor. True damage uses the full hit. Injury fills a separate gauge using injury
            resistance and pauses during an active burst.
          </p>
          <p>
            Each comparison isolates the named damage source. Select a build row for its assumptions. Rank
            coefficients, promotion stats and module stages come from the game tables. Target inputs use
            effective defenses before the selected source’s own debuffs. Skill downtime, additional targets
            and burst fallout are outside the direct attack rate.
          </p>
          <p className="hint">
            <a
              href={dataSource
                .replace('raw.githubusercontent.com', 'github.com')
                .replace('/ArknightsGamedata/', '/ArknightsGamedata/tree/')}
            >
              English game tables ↗
            </a>{' '}
            ·{' '}
            <a
              href={dataSource
                .replace('raw.githubusercontent.com', 'github.com')
                .replace('/ArknightsGamedata/', '/ArknightsGamedata/tree/')
                .replace('/en/', '/cn/')}
            >
              CN game tables ↗
            </a>{' '}
            ·{' '}
            <a href="https://github.com/arkpedia/arkpedia-stage-simulator-standalone/blob/5ded8215ae50330577d031093d73aec8c992e811/server/sim/content/arkpedia-svash2.js">
              Deployment timing ↗
            </a>
          </p>
        </details>
    </>
  );
}

export const getStaticProps = withContentPage('/dps-calculator', async () => {
  const { default: archive } = await import('@/config/dps-profiles.json');
  const enemies = process.env.ARKPEDIA_EXPORT_CONTENT === '1'
    ? (await import('@/lib/dps/enemyTargets')).enemyTargets()
    : (await import('@/data/dps-enemy-presets.json')).default as EnemyPreset[];
  return {
    props: {
      enemies,
      profiles: archive.operators as unknown as Profile[],
      dataSource: archive.source,
    },
  };
}, { bundledWhenUnpublished: true });
