import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOperatorDebut } from '../../lib/operators/operatorReleaseSchedule';
import { isDebutAvailable, isOperatorReleased, operatorReleaseLabel } from '../../lib/operators/operatorAvailability';

const schedule = {
  events: [{ name: '[Side Story – Crossover] Forecast Event', global: { dateRange: '2026/11/16–2026/11/30', note: 'ESTIMATED Global date, not officially confirmed' } }],
  banners: [{ linked_event: '[Side Story – Crossover] Forecast Event', six_stars: ['Forecast Sniper'], five_stars: ['Forecast Guard'] }],
};
const op = (name: string) => ({ name, characterInfo: { 'Release Date': '2026/11/04' }, howToObtain: null });
test('the complete debut batch follows the calendar forecast, including a trimmed welfare record', () => {
  for (const operator of [op('Forecast Sniper'), op('Forecast Guard'), { ...op('Forecast Welfare'), obtain: { welfare: { note: 'Forecast Event' } } }]) {
    const result = resolveOperatorDebut(operator, schedule);
    assert.equal('releaseEstimate' in result ? result.releaseEstimate : null, '2026-11-16');
    assert.equal(operatorReleaseLabel(result, Date.parse('2026-11-10T07:00:00Z')), 'Est. in 6 days');
    assert.equal(isDebutAvailable(result, Date.parse('2026-11-17T15:00:00Z')), false);
    assert.equal(isOperatorReleased(result, Date.parse('2026-12-01T15:00:00Z')), false, 'a forecast passing is not proof of release');
    assert.equal(result.characterInfo?.['Release Date'], '', 'do not present a forecast as a legacy confirmed date');
    assert.equal(isOperatorReleased({ characterInfo: result.characterInfo, isFuture: true }, Date.parse('2026-12-01T15:00:00Z')), false, 'older readers also stay unreleased');
  }
});
test('an exact release and a newly compiled calendar record win over compatibility fallback', () => {
  const exact = { ...op('Forecast Sniper'), releaseAt: '2026-11-18T15:00:00Z' };
  const result = resolveOperatorDebut(exact, schedule);
  assert.equal(operatorReleaseLabel(result, Date.parse('2026-11-18T14:59:59Z')), 'In 1m');
  assert.equal(isOperatorReleased(result, Date.parse(exact.releaseAt)), true);
  const compiled = { ...op('Forecast Sniper'), releaseEstimate: '2026-11-20' };
  assert.equal(resolveOperatorDebut(compiled, schedule).releaseEstimate, '2026-11-20');
});
