import assert from 'node:assert/strict';
import test from 'node:test';
import { mailboxIds, welcomeMailClaims } from '../../lib/account-import/welcomeMail';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { freeRewardLabel, freeRewardsForAccount, freeRewardTotals } from '../../lib/pulls/freeRewards';
import { mergeImportedProgress } from '../../lib/pulls/importedProgress';
import { beginnerDiagnostics } from '../../lib/account-import/beginnerDiagnostics';

const mail = { subject: 'Orundum resupply for newbie Doctors!', hasItem: 1, state: 1, items: [{ id: '4003', count: 3800 }], uid: 'PRIVATE-UID', content: 'PRIVATE-BODY' };
const reward = { id: 'free:welcome-mail', group: 'Beginner rewards', name: 'Welcome mail', rewards: [{ id: '4003', name: 'Orundum', count: 3800, orundum: 3800 }], forecast: true };

test('welcome mail requires the specific subject, complete attachment and a binary received state', () => {
  assert.deepEqual(welcomeMailClaims([mail]), { known: [reward.id], claimed: [reward.id] });
  assert.deepEqual(welcomeMailClaims([{ ...mail, state: 0 }]), { known: [reward.id], claimed: [] });
  for (const invalid of [null, { ...mail, subject: 'Maintenance compensation' }, { ...mail, state: 2 }, { ...mail, hasItem: 0 },
    { ...mail, items: [{ id: '4003', count: 380 }] }, { ...mail, items: [{ id: '4003', count: '3800' }] },
    { ...mail, items: [...mail.items, { id: '4001', count: 1 }] }]) assert.deepEqual(welcomeMailClaims([invalid]), { known: [], claimed: [] });
  assert.deepEqual(welcomeMailClaims([]), { known: [], claimed: [] });
  assert.deepEqual(welcomeMailClaims([mail, { ...mail, state: 0 }]), { known: [], claimed: [] });
});

test('mailbox partition uses explicit type, bounds input and rejects unknown attachment metadata', () => {
  assert.deepEqual(mailboxIds([{ mailId: 5, type: 0, hasItem: 1 }, { mailId: 50000, type: 1, hasItem: 1 }, { mailId: 7, type: 8, hasItem: 0 }]), { mailIdList: [5], sysMailIdList: [50000] });
  for (const value of [null, {}, Array(501).fill({}), [{ mailId: '5', type: 0, hasItem: 1 }], [{ mailId: 5, type: 2, hasItem: 1 }]]) assert.equal(mailboxIds(value), null);
});

test('mail claims round-trip without message contents, drive totals, preserve deleted-mail evidence and clear explicit unclaimed marks', () => {
  const imported = (rows: unknown[]) => accountFromGame({ arkpediaMailClaims: welcomeMailClaims(rows) }, { version: 1, chars: {} }, 'en');
  const claimed = imported([mail]);
  assert.deepEqual(parseAccount(JSON.stringify(claimed)), claimed);
  assert(!JSON.stringify(claimed).includes('PRIVATE'));
  const empty = { doneKeys: [], doneEvents: [], annihilationDone: false, ticksFrom: '' };
  const completed = { doneKeys: new Set<string>(), doneEvents: new Set<string>() };
  const progress = mergeImportedProgress(empty, claimed, completed);
  assert.deepEqual(progress.doneKeys, [reward.id]);
  assert.deepEqual(mergeImportedProgress(progress, imported([]), completed).doneKeys, [reward.id]);
  assert.deepEqual(mergeImportedProgress(progress, imported([{ ...mail, state: 0 }]), completed).doneKeys, []);
  assert.equal(freeRewardTotals(freeRewardsForAccount([reward], imported([])), new Set(), 0).orundum, 0);
  assert.equal(freeRewardTotals(freeRewardsForAccount([reward], imported([{ ...mail, state: 0 }])), new Set(), 0).orundum, 3800);
  assert.equal(freeRewardTotals(freeRewardsForAccount([reward], claimed), new Set(progress.doneKeys), 0).orundum, 0);
  assert.equal(freeRewardLabel(reward), 'New Doctor Orundum mail');
});

test('mail diagnostics expose only availability, counts and the matched gift status', () => {
  const report = beginnerDiagnostics({ arkpediaMailStatus: { status: 'read', retained: 1, uid: 'PRIVATE-UID' }, arkpediaMailClaims: welcomeMailClaims([mail]) });
  assert.deepEqual(report.sources.mail, { status: 'read', retained: 1, welcome: 'claimed' });
  assert(!JSON.stringify(report).includes('PRIVATE'));
  assert.deepEqual(beginnerDiagnostics({ arkpediaMailStatus: { status: 'unavailable', retained: 0 } }).sources.mail, { status: 'unavailable', retained: 0, welcome: 'unknown' });
});
