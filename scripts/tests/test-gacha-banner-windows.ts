import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { resolveGachaSimulatorBanners } from '../../lib/gacha/gachaBannerWindows';
import { getAllEvents } from '../../lib/schedule/schedule';
import { getAllEventListings } from '../../lib/home/frontPageContent';

test('simulator follows calendar forecasts and keeps confirmed Global dates', () => {
  const calendar = getAllEventListings(new Date('2026-09-24T12:00:00Z'));
  const source = getAllHeadhuntingBanners();
  const persona = source.find(b => b.name.includes('Persona 3 Reload'))!;
  const joint = source.find(b => b.name === '[jo] Joint Operation 23')!;
  const confirmed = source.find(b => b.name === 'Kernel #62 (Global)')!;
  const event = calendar.find(row => row.name === persona.linked_event)!;
  const resolved = resolveGachaSimulatorBanners([persona, confirmed, joint], getAllEvents(), calendar);

  assert.deepEqual(resolved.map(b => b.name), [persona.name, joint.name, confirmed.name]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date?.split('–')[0], event.dateRange.split('–')[0]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date_estimated, true);
  assert.equal(resolved.find(b => b.name === joint.name)?.global_date, '2027/02/09–2027/02/23');
  assert.equal(resolved.find(b => b.name === joint.name)?.global_date_estimated, true);
  assert.equal(resolved.find(b => b.name === confirmed.name)?.global_date, confirmed.global_date);
  assert.equal(resolved.find(b => b.name === confirmed.name)?.global_date_estimated, false);
  assert.equal(source.find(b => b.name === persona.name)?.global_date, null);
});

test('a moved calendar forecast changes the simulator order', () => {
  const calendar = getAllEventListings(new Date('2026-09-24T12:00:00Z'));
  const source = getAllHeadhuntingBanners();
  const persona = source.find(b => b.name.includes('Persona 3 Reload'))!;
  const joint = source.find(b => b.name === '[jo] Joint Operation 23')!;
  const moved = calendar.map(row => row.name === persona.linked_event
    ? { ...row, dateRange: '2027/01/01–2027/01/30' } : row);
  const resolved = resolveGachaSimulatorBanners([persona, joint], getAllEvents(), moved);
  assert.deepEqual(resolved.map(b => b.name), [joint.name, persona.name]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date, '2027/01/01–2027/01/15');
});
