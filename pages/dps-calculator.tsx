import { withContentPage } from '@/lib/content/server';
import { useRef, useState } from 'react';
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
} from '@/lib/dps/calculator';
import { firstBurst, fallout } from '@/lib/dps/breakpoints';
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
      {rows.map(({ b, result }) => (
        <div key={b.id} className={css.composition}>
          <strong>
            #{b.id} {profile(b).name}
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
}: {
  builds: Build[];
  target: Target;
  addExamples: () => void;
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
    bs.map((b) => ({ value: String(b.id), label: '#' + b.id + ' ' + profile(b).name }));
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
          <table>
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
export default function DpsCalculator({ profiles, dataSource }: { profiles: Profile[]; dataSource: string }) {
  const createBuild = (id: string, number: number) =>
    buildFromProfile(profiles.find((p) => p.id === id)!, number);
  const initial = [
    { ...createBuild('phatm2', 1), level: 60 },
    { ...createBuild('phatm2', 2), stage: 3 },
  ];
  const pickOps = [...profiles]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name + (p.region === 'CN' ? ' (CN)' : '') }));

  const [builds, setBuilds] = useState<Build[]>(initial),
    [choice, setChoice] = useState('phatm2'),
    [edit, setEdit] = useState<number | null>(null);
  const next = useRef(3),
    [target, setTarget] = useState<Target>(initialTarget);
  function add(items: Build[]) {
    if (!items.length) return;
    setBuilds((prev) => [...prev, ...items]);
    setEdit(items[0].id);
  }
  const tiers = ['Grunt', 'Elite', 'Boss'] as const;
  return (
    <>
      <PageMeta
        title="DPS Calculator"
        path="/dps-calculator"
        description="Compare operator builds, damage curves and elemental burst breakpoints."
      />
      <PageHeader title="DPS Calculator" eyebrow="Planner // Combat analysis" slim />
      <main className={css.page}>
        <div className={css.workspace}>
          <div className={css.left}>
            <section className={css.panel}>
              <div className={css.heading}>
                <h2 className="section-title">Builds</h2>
                <small>100% trust</small>
              </div>
              {builds.map((b) => (
                <article key={b.id} className={css.build} style={{ borderLeftColor: color(b) }}>
                  <div className={css.row}>
                    <Image src={getOperatorIconPath(profile(b))} alt="" width={48} height={48} />
                    <div>
                      <strong>{profile(b).name}</strong>
                      <small>
                        #{b.id} · {buildLabel(b)}
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
                <Pick label="Operator" options={pickOps} value={choice} change={setChoice} />
                <button className="btn btn-sm" onClick={() => add([createBuild(choice, next.current++)])}>
                  Add build
                </button>
              </div>
            </section>
            <section className={css.panel}>
              <h2 className="section-title">Target</h2>
              <div className={css.controls}>
                <Pick
                  label="Class"
                  value={target.tier}
                  options={[...tiers]}
                  change={(v) => setTarget({ ...target, tier: v as Target['tier'] })}
                />
                <Pick
                  label="Active burst"
                  value={target.burst}
                  options={['None', 'Necrosis', 'Burn', 'Corrosion', 'Nervous Impairment', 'Rampage']}
                  change={(v) => setTarget({ ...target, burst: v })}
                />
                {(['def', 'res', 'elementalRes', 'injuryRes'] as const).map((key, i) => (
                  <label key={key} className={css.field}>
                    {['DEF', 'RES', 'Elemental RES', 'Injury resistance'][i]}
                    <input
                      type="number"
                      min="0"
                      max={i ? 100 : 3000}
                      value={target[key]}
                      onChange={(e) =>
                        setTarget({
                          ...target,
                          [key]: Math.min(i ? 100 : 3000, Math.max(0, Number(e.target.value))),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
          <div className={css.right}>
            <ComparisonPlot builds={builds} target={target} setTarget={setTarget} />
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
                    {builds.map((b) => {
                      const r = calculate(b, target);
                      return (
                        <tr key={b.id}>
                          <th>
                            <details>
                              <summary>
                                #{b.id} {profile(b).name} · {r.source}
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
          </div>
        </div>
        {builds.some((b) => calculate(b, target).element) && (
          <section className={css.panel}>
            <h2 className="section-title">First burst from an empty gauge</h2>
            <div className={css.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    {tiers.map((t) => (
                      <th key={t}>
                        {t} · {t === 'Boss' ? '2,000' : '1,000'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {builds
                    .filter((b) => calculate(b, target).element)
                    .map((b) => (
                      <tr key={b.id}>
                        <th>
                          #{b.id} {profile(b).name}
                          <small>
                            {calculate(b, target).summon ? 'Blood’s Whisper' : calculate(b, target).source}
                          </small>
                        </th>
                        {tiers.map((tier) => {
                          const r = firstBurst(b, { ...target, tier });
                          return (
                            <td key={tier}>
                              {r.count ? r.count + ' ' + r.unit : r.limited ? 'Below threshold' : '—'}
                              <small>
                                {fmt(r.amount)} injury{r.limited ? ' / summon' : ' / action'}
                              </small>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <small>
              Selected source alone. Tragodia’s S3 includes its per-second injury. A summon must reach
              threshold within one deployment.
            </small>
          </section>
        )}
        <DamageComposition builds={builds} target={target} />
        <Deployment
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
          <a
            href={dataSource
              .replace('raw.githubusercontent.com', 'github.com')
              .replace('/ArknightsGamedata/', '/ArknightsGamedata/tree/')}
          >
            English game tables
          </a>{' '}
          ·{' '}
          <a
            href={dataSource
              .replace('raw.githubusercontent.com', 'github.com')
              .replace('/ArknightsGamedata/', '/ArknightsGamedata/tree/')
              .replace('/en/', '/cn/')}
          >
            CN game tables
          </a>{' '}
          ·{' '}
          <a href="https://github.com/arkpedia/arkpedia-stage-simulator-standalone/blob/5ded8215ae50330577d031093d73aec8c992e811/server/sim/content/arkpedia-svash2.js">
            Deployment timing
          </a>
        </details>
      </main>
    </>
  );
}

export const getStaticProps = withContentPage(
  '/dps-calculator',
  async () => {
    const { default: archive } = await import('@/config/dps-profiles.json');
    return { props: { profiles: archive.operators as unknown as Profile[], dataSource: archive.source } };
  },
  { bundledWhenUnpublished: true },
);
