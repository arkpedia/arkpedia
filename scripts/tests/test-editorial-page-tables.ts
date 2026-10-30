import assert from 'node:assert/strict';
import test from 'node:test';
import { strongholdData } from '../../lib/gamemodes/stronghold';
import { assertOpening, nudgeMap, type OpeningBand } from '../../lib/gamemodes/strongholdOpening';
import { assertPlaybook, type AlliancePlan } from '../../lib/gamemodes/strongholdPlaybook';
import { recommendation, DEFAULT_SELECTOR_PREFERENCES, type SelectorCandidate } from '../../lib/selectors/scoring';
import opening from '../../data/stronghold-opening.json';
import playbook from '../../data/stronghold-playbook.json';

// An editorial release must still be checked against the season it describes.
test('Stronghold editorial records validate against the season, and invalid names refuse the compile', () => {
  const data = strongholdData();
  assertOpening(data, opening.bands as OpeningBand[]);
  assertPlaybook(data, playbook.plans as AlliancePlan[]);
  const brokenOpening = structuredClone(opening.bands) as OpeningBand[];
  brokenOpening[0].picks[0].operator = 'An operator absent from this season';
  assert.throws(() => assertOpening(data, brokenOpening), /absent from this season/);
  const brokenPlaybook = structuredClone(playbook.plans) as AlliancePlan[];
  brokenPlaybook[0].alliance = 'An alliance absent from this season';
  assert.throws(() => assertPlaybook(data, brokenPlaybook), /absent from this season/);
});

test('opening advice and selector coverage read the provided release rather than a compiled-in list', () => {
  const bands: OpeningBand[] = [{ tier: 'I', rounds: '1', picks: [{ operator: 'A', for: [{ alliance: 'Test', note: 'Good Stacker' }] }], fallback: [], blocks: [] }];
  assert.equal(nudgeMap(bands).get('Test')?.[0].operator, 'A');
  bands[0].picks[0].operator = 'B';
  assert.equal(nudgeMap(bands).get('Test')?.[0].operator, 'B');
  const candidate: SelectorCandidate = { name: 'Test', id: 'test', caster: false, supporter: false, talentReveal: false, arts: false, trueDamage: false, kukkikaze: 6.6, community: 6.6, mainSkills: 0, subSkills: 0, isModule: false, raModule: false };
  const preferences = { ...DEFAULT_SELECTOR_PREFERENCES, gameDestroyer: true };
  const before = recommendation(candidate, [candidate], [], preferences, []);
  const after = recommendation(candidate, [candidate], [], preferences, [{ id: 'test', name: 'Test' }]);
  assert.equal(after.total, before.total + 1);
});
