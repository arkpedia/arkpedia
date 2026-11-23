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
  normalize,
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
import type { EnemyPreset, EnemyLevel } from '@/lib/dps/enemyTargets';
import { deploymentSequence } from '@/lib/dps/deployment';
import css from '@/components/dps/Dps.module.css';

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const baseline = new Set([
  'phatm2',
  'hsgma2',
  'qiubai',
  'amiya',
  'melan',
  'phonor',
  'cello',
  'yu',
  'thumpy',
  'cairn',
  'oxi',
  'mlyss',
  'ifrit',
  'thorns',
  'vvana',
  'logos',
  'skadi',
  'ulpia',
  'phatom',
]);
const cnSkills: Record<string, string[]> = {
  caledo: ['Charged strike', 'Multi-target strike'],
  thumpy: ['', 'Glue field', 'Conveyor'],
  clemnt: ['', 'Whirlpool', 'Ammunition'],
  oxi: ['', '', 'Fire waves'],
};
function Editor({ b, update }: { b: Build; update: (v: Build) => void }) {
  const p = profile(b);
  const options = p.skills
    .filter((s) => s.elite <= b.elite)
    .map((s) => ({
      label: 'S' + s.slot + ' · ' + (cnSkills[p.id]?.[s.slot - 1] || s.name),
      value: String(s.slot),
    }));
  if (baseline.has(p.id))
    options.unshift({
      value: '0',
      label: ['yu', 'cairn', 'cello'].includes(p.id) ? 'Talent aura' : 'Normal attack',
    });
  const set = (v: Partial<Build>) => {
    const next = { ...b, ...v };
    if (!baseline.has(p.id) && !p.skills.some((s) => s.slot === next.skill && s.elite <= next.elite))
      next.skill = p.skills.find((s) => s.elite <= next.elite)!.slot;
    update(normalize(next));
  };
  const toggle = (label: string, checked: boolean, fn: (v: boolean) => void) => (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => fn(e.target.checked)} />
      {label}
    </label>
  );
  return (
    <div className={css.editor}>
      <div className={css.fields}>
        <Pick
          label="Promotion"
          value={b.elite}
          options={range(
            baseline.has(p.id) ? 0 : Math.min(...p.skills.map((s) => s.elite)),
            p.phases.length - 1,
          ).map((v) => ({ label: 'Elite ' + v, value: String(v) }))}
          change={(v) => set({ elite: +v })}
        />
        <Pick
          label="Level"
          value={b.level}
          options={range(1, p.phases[b.elite].maxLevel)}
          change={(v) => set({ level: +v })}
        />
        <Pick
          label="Potential"
          value={b.potential}
          options={range(1, 1 + p.potential.length)}
          change={(v) => set({ potential: +v })}
        />
        <Pick label="Damage source" value={b.skill} options={options} change={(v) => set({ skill: +v })} />
        {b.skill > 0 && (
          <Pick
            label="Skill rank"
            value={b.rank}
            options={range(
              1,
              Math.min([4, 7, 10][b.elite], p.skills.find((s) => s.slot === b.skill)!.ranks.length),
            ).map((v) => ({ label: rankLabel(v), value: String(v) }))}
            change={(v) => set({ rank: +v })}
          />
        )}
        {p.module && b.elite === 2 && b.level >= p.module.level && (
          <Pick
            label="Module"
            value={b.stage ? selectedModule(b)!.name + '/' + b.stage : 'none'}
            options={[
              { value: 'none', label: 'No module' },
              ...[p.module, p.alternateModule].flatMap((mod) =>
                mod
                  ? range(1, 3).map((stage) => ({
                      value: mod.name + '/' + stage,
                      label: mod.name + ' · Lv ' + stage,
                    }))
                  : [],
              ),
            ]}
            change={(v) =>
              set({
                stage: v === 'none' ? 0 : Number(v.slice(-1)),
                alternateModule: v.split('/')[0] === p.alternateModule?.name,
                traitActive: false,
              })
            }
          />
        )}
        {p.id === 'qiubai' && (
          <Pick
            label="Target control"
            value={b.control}
            options={[
              { label: 'No control', value: 'none' },
              { label: 'Slow or Bind', value: 'one' },
              { label: 'Slow and Bind', value: 'both' },
            ]}
            change={(v) => set({ control: v as Build['control'] })}
          />
        )}
      </div>
      {p.id === 'phatm2' &&
        b.skill === 2 &&
        toggle('Plot Blood’s Whisper ticks', b.plotSummon, (v) => set({ plotSummon: v }))}
      {p.id === 'skadi' &&
        b.stage > 0 &&
        toggle(b.alternateModule ? 'Attacking a blocked target' : 'After revival', b.traitActive, (v) =>
          set({ traitActive: v }),
        )}
      {p.id === 'phatom' &&
        b.stage > 0 &&
        b.alternateModule &&
        toggle('No adjacent allies · clone undeployed', b.traitActive, (v) => set({ traitActive: v }))}
      {p.id === 'hsgma2' && (
        <>
          {toggle('Maximum Tenacity', b.tenacity, (v) => set({ tenacity: v }))}
          {b.skill === 3 && toggle('Last stand', b.lastStand, (v) => set({ lastStand: v }))}
        </>
      )}
      {p.id === 'qiubai' &&
        b.skill === 3 &&
        toggle('Maximum ASPD stacks', b.stacked, (v) => set({ stacked: v }))}
      {p.id === 'rfrost' &&
        b.skill === 2 &&
        toggle('Target within Frost’s attack range', b.trapInRange, (v) => set({ trapInRange: v }))}
      {['robin', 'doroth', 'rfrost', 'wulfen'].includes(p.id) &&
        b.stage > 0 &&
        toggle('Enhanced trap', b.lastStand, (v) => set({ lastStand: v }))}
    </div>
  );
}
function BuildDetails({ b, target }: { b: Build; target: Target }) {
  const r = calculate(b, target),
    burst = fallout(r.element, target);
  return (
    <div className={css.breakdown}>
      <p>
        {r.source} · {r.interval ? fmt(r.interval) + ' s between actions' : 'Single activation'} ·{' '}
        {fmt(r.sourceAtk)} source ATK
      </p>
      <dl>
        {Object.entries(r.components)
          .filter(([, v]) => v > 0)
          .map(([key, v]) => (
            <div key={key}>
              <dt>{key} HP damage</dt>
              <dd>{fmt(v)}</dd>
            </div>
          ))}
        {r.element && (
          <div>
            <dt>{r.element} / action</dt>
            <dd>{fmt(r.injury)}</dd>
          </div>
        )}
        {r.splash > 0 && (
          <div>
            <dt>Adjacent target injury / action</dt>
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
            <dt>Blood’s Whisper · {r.summon.ticks} ticks</dt>
            <dd>
              {fmt(r.summon.damage)} Arts · {fmt(r.summon.injury)} potential injury
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
              Ramps to 2,110 elemental HP/s before resistance. Ramp damage is outside the action totals.
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
  const rows = builds.map((b) => ({ b, result: calculate(b, target) }));
  const max = Math.max(1, ...rows.map((row) => row.result.damage));
  return (
    <details className={css.panel}>
      <summary>Damage by type · HP per action</summary>
      {rows.map(({ b, result }, index) => (
        <div key={b.id} className={css.composition}>
          <strong>
            #{index + 1} {profile(b).name}
          </strong>
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
          <small>
            {Object.entries(result.components)
              .filter(([, v]) => v > 0)
              .map(([type, v]) => type + ' ' + fmt(v))
              .join(' · ') || '0 HP damage'}
          </small>
        </div>
      ))}
    </details>
  );
}
function Deployment({
  builds,
  target,
  addExamples,
  timelineRef,
}: {
  builds: Build[];
  target: Target;
  addExamples: () => void;
  timelineRef: RefObject<HTMLTableElement | null>;
}) {
  const ss = builds.filter((b) => b.operator === 'svash2' && b.skill === 2);
  const allies = builds.filter((b) => b.operator !== 'svash2');
  const [owner, setOwner] = useState(0),
    [ally, setAlly] = useState(0),
    [stacks, setStacks] = useState(2),
    [delay, setDelay] = useState(0);
  const s = ss.find((b) => b.id === owner) ?? ss[0],
    a = allies.find((b) => b.id === ally) ?? allies.find((b) => b.operator === 'skadi') ?? allies[0];
  const maxStacks = s ? profile(s).skills.find((x) => x.slot === 2)!.ranks[s.rank - 1].max_stack_cnt : 0;
  const opts = (bs: Build[]) =>
    bs.map((b) => ({ value: String(b.id), label: '#' + (builds.indexOf(b) + 1) + ' ' + profile(b).name }));
  return (
    <details className={css.panel}>
      <summary>Deployment timeline · SilverAsh the Reignfrost S2</summary>
      <p>
        Each stored strike uses the marked ally’s ATK when it lands. This scenario assumes the ally was left
        of the Eye when marked and the target stays in range.
      </p>
      {(!a || !s) && (
        <button className="btn btn-sm" onClick={addExamples}>
          Add deployment builds
        </button>
      )}
      {a && s && (
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
          <table
            ref={timelineRef}
            aria-label={
              'Deployment · #' +
              (builds.indexOf(s) + 1) +
              ' ' +
              profile(s).name +
              ' S2 with #' +
              (builds.indexOf(a) + 1) +
              ' ' +
              profile(a).name +
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
              {deploymentSequence(s, a, target, stacks, delay).map((e) => (
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
            Manual skills wait for sufficient SP at 1 SP/s. At the same timestamp, activation precedes the
            strike. Other allies use their deployment ATK unless an activation is shown. Ulpianus’s anchor
            travel hit is separate.
          </p>
        </>
      )}
    </details>
  );
}
export default function DpsCalculator({
  profiles,
  dataSource,
  enemies = [],
}: {
  profiles: Profile[];
  dataSource: string;
  enemies?: EnemyPreset[];
}) {
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
  const timelineRef = useRef<HTMLTableElement>(null);
  const next = useRef(1),
    [target, setTarget] = useState<Target>(initialTarget);
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
  function customize(next: Target) {
    setEnemy(null);
    setTarget(next);
  }
  function add(items: Build[]) {
    if (!items.length) return;
    setBuilds((prev) => [...prev, ...items]);
    setEdit(items[0].id);
  }
  const tiers = ['Grunt', 'Elite', 'Boss'] as const;
  const columns = enemy || target.thresholdOverride ? [target.tier] : tiers;
  return (
    <>
      <PageMeta
        title="DPS Calculator"
        path="/dps-calculator"
        description="Compare operator builds, damage curves and elemental burst breakpoints."
      />
      <PageHeader title="DPS Calculator" eyebrow="Tools // Combat analysis" slim />
      <main className={css.page}>
        <div className={css.workspace}>
          <div className={css.left}>
            <section className={css.panel}>
              <div className={css.heading}>
                <h2 className="section-title">Builds</h2>
                <small>100% trust</small>
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
                  <div className={css.actions}>
                    <button
                      className="btn btn-sm"
                      aria-expanded={edit === b.id}
                      onClick={() => setEdit(edit === b.id ? null : b.id)}
                    >
                      {edit === b.id ? 'Done' : 'Edit'}
                    </button>
                    <button className="btn btn-sm" onClick={() => add([{ ...b, id: next.current++ }])}>
                      Duplicate
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => setBuilds((prev) => prev.filter((x) => x.id !== b.id))}
                    >
                      Remove
                    </button>
                  </div>
                  {edit === b.id && (
                    <Editor
                      b={b}
                      update={(v) => setBuilds((prev) => prev.map((x) => (x.id === v.id ? v : x)))}
                    />
                  )}
                </article>
              ))}
              <div className={css.add}>
                <BuildSearch
                  label="Add operator"
                  placeholder="Search operators to add…"
                  choices={pickOps}
                  pick={(id) => add([createBuild(id, next.current++)])}
                />
              </div>
            </section>
            <section className={css.panel}>
              <div className={css.heading}>
                <h2 className="section-title">Target</h2>
                <strong>
                  {enemy ? [enemy.name, enemy.code].filter(Boolean).join(' · ') : 'Custom target'}
                </strong>
              </div>
              {enemies.length > 0 && (
                <BuildSearch
                  label="Find enemy"
                  placeholder="Search enemies by name or code…"
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
                {!enemy && (
                  <Pick
                    label="Class"
                    value={target.tier}
                    options={[...tiers]}
                    change={(v) =>
                      setTarget({ ...target, tier: v as Target['tier'], thresholdOverride: undefined })
                    }
                  />
                )}
                <Pick
                  label="Active burst"
                  value={target.burst}
                  options={['None', 'Necrosis', 'Burn', 'Corrosion', 'Nervous Impairment', 'Rampage']}
                  change={(v) => setTarget({ ...target, burst: v })}
                />
                <label className={css.field}>
                  Burst threshold
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    readOnly={!!enemy}
                    placeholder={String(threshold(target.tier))}
                    value={enemy ? burstThreshold(target) : (target.thresholdOverride ?? '')}
                    onChange={(e) => {
                      const n = e.currentTarget.valueAsNumber;
                      setTarget({
                        ...target,
                        thresholdOverride: Number.isFinite(n) ? Math.min(10000, Math.max(1, n)) : undefined,
                      });
                    }}
                  />
                </label>
                {(['def', 'res', 'elementalRes', 'injuryRes'] as const).map((key, i) => (
                  <label key={key} className={css.field}>
                    {['DEF', 'RES', 'Elemental RES', 'Injury resistance'][i]}
                    <input
                      type="number"
                      min="0"
                      readOnly={!!enemy}
                      max={i ? 100 : undefined}
                      value={target[key]}
                      onChange={(e) =>
                        setTarget({
                          ...target,
                          [key]: Math.min(i ? 100 : Infinity, Math.max(0, Number(e.target.value))),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
          <div className={css.right}>
            {!builds.length ? (
              <section className={css.panel}>
                <h2 className="section-title">Build comparison</h2>
                <p>Add an operator to plot damage and compare builds.</p>
              </section>
            ) : (
              <>
                <ComparisonPlot
                  timelineRef={timelineRef}
                  targetName={
                    enemy ? [enemy.name, enemy.code, 'Lv ' + level].filter(Boolean).join(' · ') : 'Custom target'
                  }
                  builds={builds}
                  target={target}
                  setTarget={customize}
                />
                <section className={css.panel}>
                  <h2 className="section-title">Build comparison</h2>
                  <div className={css.scroll}>
                    <table>
                      <thead>
                        <tr>
                          <th>Build / source</th>
                          <th>HP / action</th>
                          <th>HP / s</th>
                          <th>Injury / action</th>
                          <th>Injury / s</th>
                        </tr>
                      </thead>
                      <tbody>
                        {builds.map((b, index) => {
                          const r = calculate(b, target);
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
                              <td>{fmt(r.damage)}</td>
                              <td>{fmt(r.dps)}</td>
                              <td>{fmt(r.injury)}</td>
                              <td>{fmt(r.injuryRate)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <small>
                    Single target. Rates describe the selected action while active. One-off triggers show damage
                    per use.
                  </small>
                </section>
              </>
            )}
          </div>
        </div>
        {builds.some((b) => calculate(b, target).element) && (
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
                    const action = calculate(b, target);
                    if (!action.element) return [];
                    const equipped = selectedModule(b);
                    const eliteScale = equipped?.name === 'RIT-X'
                      ? equipped.stages[b.stage - 1]?.trait.ep_damage_scale
                      : undefined;
                    const amountLabel = action.empowered ? 'cycle average / action' : 'per action';
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
                                {fmt(r.amount)} injury{r.summon ? ' / summon' : action.empowered ? ' / action (cycle average)' : ' / action'}
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
              target. The interval to the next burst includes recovery and rebuilding the gauge. Externally
              triggered actions show the required count when their timing depends on another actor.
            </small>
          </section>
        )}
        {builds.length > 0 && <DamageComposition builds={builds} target={target} />}
        <Deployment
          timelineRef={timelineRef}
          builds={builds}
          target={target}
          addExamples={() =>
            add(
              ['svash2', 'skadi', 'ulpia', 'phatom']
                .filter(
                  (id) => !builds.some((b) => b.operator === id && b.skill === createBuild(id, 0).skill),
                )
                .map((id) => createBuild(id, next.current++)),
            )
          }
        />
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
      </main>
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
