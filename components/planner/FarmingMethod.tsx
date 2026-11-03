import styles from './FarmingMethod.module.css';
import ActionPopover from '@/components/ui/ActionPopover';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import { usePlannerContent } from '@/lib/content/planner';
import type { FarmingIncoming, FarmingMethod as Method } from '@/lib/planner/farmingMethod';
import { FARMING_STRINGS as text } from '@/lib/planner/farmingStrings';

/**
 * The Farming method: which events the plan counts on, up to a date, and whether it buys from
 * their shops (lib/planner/farmingMethod.ts). A pop-up under the "Still needed" panel's heading,
 * in the same family as the Goals filter beside it. A floating panel adds nothing to the page's
 * height; what it changes is the list under it, whose floor (ShortfallList's useHeightFloor)
 * keeps the reader where they are as materials leave it.
 */

const today = () => new Date().toISOString().slice(0, 10);

export default function FarmingMethodMenu({ method, onChange, farming, claimedModes }: {
  method: Method;
  onChange: (next: Method) => void;
  /** What the method counts right now, or null while it is off. */
  farming: FarmingIncoming | null;
  /** The modes the imported account has claim records for (lib/account/permanentClaims.ts). */
  claimedModes: ReadonlySet<string>;
}) {
  const { farmingEvents, permanentRewards } = usePlannerContent();
  const modes = permanentRewards.modes;
  const readModes = modes.filter((mode) => claimedModes.has(mode.id)).map((mode) => mode.label);
  const togglePermanent = (id: string, on: boolean) => onChange({ ...method, permanent: on ? [...new Set([...method.permanent, id])] : method.permanent.filter((m) => m !== id) });
  const on = method.until.mode === 'banner' || method.until.mode === 'date';
  const active = method.until.mode !== 'off';
  const banners = farmingEvents.banners;
  const mode = method.until.mode;
  const counted = farming?.events.length ?? 0;

  return (
    <ActionPopover
      label={text.label}
      width={360}
      align="end"
      className={`ghost btn-sm planner-farming-trigger${active ? ' on' : ''}`}
      trigger={<><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M10 17V8M10 8c0-3 2-5 5-5 0 3-2 5-5 5ZM10 11c0-2.5-1.8-4-4.5-4 0 2.5 1.8 4 4.5 4Z" /></svg><span>{text.label}</span>{active && <b>{counted + (farming?.permanent.length ?? 0)}</b>}</>}
    >
      <div className="planner-farming-menu">
        <div className="planner-farming-head"><h3>{text.heading}</h3></div>
        <p className="hint plan-hint">{text.lead}</p>

        <SegmentedControl<'off' | 'permanent' | 'banner' | 'date'>
          className={styles.modes}
          label={text.untilLabel}
          value={mode}
          onChange={(next) => {
            if (next === 'off') onChange({ ...method, until: { mode: 'off' }, permanent: [] });
            else if (next === 'permanent') onChange({ ...method, until: { mode: 'permanent' } });
            else if (next === 'banner') onChange({ ...method, until: banners[0] ? { mode: 'banner', banner: banners[0].name } : { mode: 'off' } });
            else onChange({ ...method, until: { mode: 'date', date: today() } });
          }}
          options={[{ value: 'off', label: text.off }, { value: 'permanent', label: text.permanentOnly }, { value: 'banner', label: text.byBanner, disabled: banners.length === 0 }, { value: 'date', label: text.byDate }]}
        />

        {method.until.mode === 'banner' && (
          <StyledSelect label={text.bannerLabel} value={method.until.banner}
            onChange={(banner) => onChange({ ...method, until: { mode: 'banner', banner } })}
            options={banners.map((b) => ({ value: b.name, label: `${b.name} · until ${b.end}` }))} />
        )}
        {method.until.mode === 'date' && (
          <label className="planner-farming-date">{text.dateLabel}
            <input type="date" className="pulls-date" min={today()} max="2099-12-31" value={method.until.date}
              onChange={(event) => { if (event.target.value) onChange({ ...method, until: { mode: 'date', date: event.target.value } }); }} />
          </label>
        )}

        {on && (
          <p className="hint plan-hint planner-farming-summary" aria-live="polite">
            {farming === null ? text.bannerGone
              : counted === 0 ? text.none
                : text.summary(counted, farming.events.reduce((n, event) => n + event.materials, 0), new Date((farming.until ?? 0) - 1).toISOString().slice(0, 10))}
          </p>
        )}
        {farming && counted > 0 && (
          <ul className="planner-farming-events">
            {farming.events.map((event) => (
              <li key={event.name}><span>{event.name}</span><i>{event.start}{event.estimated ? ` ${text.estimated}` : ''}</i></li>
            ))}
          </ul>
        )}

        {on && <div className="planner-farming-options" role="group" aria-label={text.shopsLabel}>
          <label className="check"><input type="checkbox" checked={method.shop} disabled={!on}
            onChange={(event) => onChange({ ...method, shop: event.target.checked })} />{text.shop}</label>
          <label className="check"><input type="checkbox" checked={method.unlimitedShop} disabled={!on}
            onChange={(event) => onChange({ ...method, unlimitedShop: event.target.checked })} />{text.unlimitedShop}</label>
        </div>}
        {active && <p className="hint plan-hint">{text.assumes}</p>}

        {active && <details className="planner-farming-permanent" open={mode === 'permanent' ? true : undefined}>
          <summary>{text.permanent}</summary>
          <p className="hint plan-hint">{text.permanentLead}</p>
          <div className="planner-farming-options" role="group" aria-label={text.permanent}>
            {modes.map((mode) => {
              const on = method.permanent.includes(mode.id);
              const counted = farming?.permanent.find((m) => m.id === mode.id);
              return (
                <label key={mode.id} className="check planner-farming-mode">
                  <input type="checkbox" checked={on} disabled={!active} onChange={(event) => togglePermanent(mode.id, event.target.checked)} />
                  <span>{mode.label}</span>
                  {(!mode.global || mode.rewards.some((reward) => reward.cn)) && (
                    <i className="planner-farming-cn" title={text.cnOnlyTitle}>{mode.global ? text.cnPart(mode.rewards.filter((reward) => reward.cn).length) : text.cnOnly}</i>
                  )}
                  {on && counted && <small>{text.permanentRewards(counted.rewards, counted.materials)}</small>}
                </label>
              );
            })}
          </div>
          <p className="hint plan-hint">{readModes.length ? text.claimsRead(readModes.join(', ')) : text.claimsNone}</p>
          <p className="hint plan-hint">{text.claimsUnchecked}</p>
        </details>}
      </div>
    </ActionPopover>
  );
}
