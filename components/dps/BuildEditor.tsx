import { defaultSource, normalize, profile, rankLabel, selectedModule, type Build, type Profile } from '@/lib/dps/calculator';
import { isHealingProfile } from '@/lib/dps/healing';
import { Pick } from './ComparisonPlot';
import css from './Dps.module.css';

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const baseline = new Set([
  'chen',
  'angel',
  'warmy',
  'nymph',
  'deepcl',
  'otter',
  'ling',
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
const allowsNormal = (p: Profile, survival?: boolean) => !(survival && p.id === 'haruka')
  && (baseline.has(p.id) || !p.skills.length || isHealingProfile(p));
function updateBuild(b: Build, changes: Partial<Build>, survival?: boolean) {
  const p = profile(b);
  const next = { ...b, ...changes };
  if (!allowsNormal(p, survival) && !p.skills.some((s) => s.slot === next.skill && s.elite <= next.elite))
    next.skill = p.skills.find((s) => s.elite <= next.elite)!.slot;
  return normalize(next);
}
export function DamageSource({ b, update, survival }: { b: Build; update: (v: Build) => void; survival?: boolean }) {
  const p = profile(b);
  if (!p.skills.length) return null;
  const options = p.skills
    .filter(s => s.elite <= b.elite && !(survival && p.id === 'skadi2' && s.slot === 3))
    .map((s) => ({
      label: 'S' + s.slot + ' · ' + (cnSkills[p.id]?.[s.slot - 1] || s.name),
      value: String(s.slot),
    }));
  if (allowsNormal(p, survival))
    options.unshift({
      value: '0',
      label: defaultSource(b),
    });
  return <Pick label={isHealingProfile(p) ? 'Source' : 'Damage source'} value={b.skill} options={options}
    change={v => update(updateBuild(b, { skill: +v }, survival))} />;
}
export default function BuildEditor({ b, update, hideSource, survival, cycle }: { b: Build; update: (v: Build) => void; hideSource?: boolean; survival?: boolean; cycle?: boolean }) {
  const p = profile(b);
  const set = (changes: Partial<Build>) => update(updateBuild(b, changes, survival));
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
            allowsNormal(p, survival) ? 0 : Math.min(...p.skills.map((s) => s.elite)),
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
        {!hideSource && <DamageSource b={b} update={update} survival={survival} />}
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
        {p.id === 'haruka' && b.skill === 2 && !cycle && (
          <Pick label="Skill activation" value={b.firstHealingCast ? 'first' : 'later'}
            options={[{ label: 'First activation', value: 'first' }, { label: 'Second activation onward', value: 'later' }]}
            change={value => set({ firstHealingCast: value === 'first' })} />
        )}
      </div>
      {p.id === 'skadi2' && (
        <>
          {toggle('Abyssal Hunter in range', !!b.abyssalAlly, value => set({ abyssalAlly: value }))}
          {b.stage > 0 && !b.alternateModule && toggle('Two or more other allies in range', !!b.twoAlliesInRange,
            value => set({ twoAlliesInRange: value }))}
        </>
      )}
      {p.id === 'susuro' && !survival && (
        <>
          {b.elite > 0 && toggle('Ally costs 10 DP or less', !!b.lowCostHealingTarget, value => set({ lowCostHealingTarget: value }))}
          {b.stage > 0 && toggle('Ally below 50% HP', !!b.healingTargetBelowHalf, value => set({ healingTargetBelowHalf: value }))}
        </>
      )}
      {p.id === 'phatm2' &&
        b.skill === 2 &&
        toggle('Plot Blood’s Whisper ticks', b.plotSummon, (v) => set({ plotSummon: v }))}
      {p.id === 'angel' && b.stage > 0 &&
        toggle(b.alternateModule ? 'Ground enemy in range' : 'Attacking an aerial target', b.traitActive, (v) => set({ traitActive: v }))}
      {p.id === 'angel' && b.alternateModule && b.stage >= 2 && (
        <Pick label="DEF ignore stacks" value={b.penetrationStacks ?? 0}
          options={range(0, selectedModule(b)!.stages[b.stage - 1].talents[0][0].values.max_stack_cnt)}
          change={v => set({penetrationStacks: +v})} />
      )}
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
