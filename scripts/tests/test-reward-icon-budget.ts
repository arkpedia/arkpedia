import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('reward icon batches publish completed art and report deferred icons when their budget expires', () => {
  const result = spawnSync('python3', ['-c', `
import ast, hashlib, io, json, pathlib, re, sys, tempfile, urllib.parse
from types import SimpleNamespace
from PIL import Image
sys.path.insert(0, str(pathlib.Path('scripts/imports').resolve()))
from download_budget import DownloadBudget, BudgetExpired
from staged_art import Staging
source = ast.parse(pathlib.Path('scripts/imports/import-reward-icons.py').read_text())
loop = next(n for n in source.body if isinstance(n, ast.For) and ast.unparse(n.target).startswith('(index,'))
defer = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'defer_remaining')
reason = next(n for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DEFERRED' for t in n.targets))
budget_init = next(n for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'download_budget' for t in n.targets) and isinstance(n.value, ast.Call))
body = ast.Module(body=[budget_init, reason, defer, loop], type_ignores=[])
image = Image.new('RGBA', (2, 2), (1, 2, 3, 255))
buffer = io.BytesIO(); image.save(buffer, 'PNG'); blob = buffer.getvalue()
for mode in ['healthy', 'checkpoint_expiry', 'request_expiry', 'adoption']:
  now = [0]
  with tempfile.TemporaryDirectory() as root:
    staging = Staging('reward-icons', root)
    commit = staging.commit
    def checkpoint():
      commit()
      if mode == 'checkpoint_expiry': now[0] = 601
    staging.commit = checkpoint
    pending = [('material-icons/'+name+'.webp', (name, 'Event', None, None)) for name in ['First', 'Second', 'Third']]
    requested = []
    def fetch(url):
      requested.append(url)
      if mode == 'request_expiry' and len(requested) == 2: raise BudgetExpired('deadline during response')
      return blob
    scope = dict(pending=pending, DownloadBudget=lambda seconds: DownloadBudget(seconds, clock=lambda: now[0]),
      os=SimpleNamespace(environ={'ARKPEDIA_ART_ADOPTION': '1'} if mode == 'adoption' else {}),
      unresolved=[], fetched=[], staging=staging, icon_by_id={}, by_name={name: name for name in ['First', 'Second', 'Third']},
      ITEM_ART='https://raw.githubusercontent.com/example/pinned/item', CN_REF='a'*40, ITEM_MIRROR='example/pinned',
      fetch=fetch, Image=Image, BytesIO=io.BytesIO, BudgetExpired=BudgetExpired, re=re, urllib=urllib,
      hosts_down=set(), host_failures={}, NOT_FOUND='missing', FAILED='failed at {host}', UNREADABLE='unreadable at {host}')
    exec(compile(body, '<actual reward icon batch>', 'exec'), scope)
    count = 3 if mode == 'healthy' else 0 if mode == 'adoption' else 1
    assert len(scope['fetched']) == count
    assert len(scope['unresolved']) == 3-count
    assert all(row[-1] == scope['DEFERRED'] for row in scope['unresolved'])
    # The actual producer checkpoint must exist before any final batch commit runs.
    manifests = [p for p in (pathlib.Path(root)/'.cache/reward-icons').glob('*.json')]
    assert len(manifests) == (1 if count else 0)
    if mode == 'adoption':
      assert not requested
      continue
    rows = json.loads(manifests[0].read_text())['files']
    assert len(rows) == count
    for target, row in rows.items():
      assert row['sha256'] == hashlib.sha256(blob).hexdigest()
      assert row['mirror']['commit'] == 'a'*40
      assert (pathlib.Path(root)/'.cache/reward-icons'/row['file']).read_bytes() == blob
`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('slow response bodies and retries cannot run past the download budget', () => {
  const result = spawnSync('python3', ['-c', `
import http.client, pathlib, sys
sys.path.insert(0, str(pathlib.Path('scripts/imports').resolve()))
from download_budget import DownloadBudget, BudgetExpired
now = [0]
budget = DownloadBudget(1, clock=lambda: now[0], sleep=lambda n: now.__setitem__(0, now[0]+n))
assert budget.timeout(90) == 1
assert DownloadBudget(100, clock=lambda: 0).timeout(90) == 20
budget.sleep(.25)
try:
  budget.sleep(1)
  raise AssertionError('retry ran beyond deadline')
except BudgetExpired: pass
assert now[0] == .25
class DrippingResponse:
  calls = 0
  def read1(self, size):
    self.calls += 1
    now[0] += .5
    return b'x'
response = DrippingResponse()
try:
  budget.read(response)
  raise AssertionError('dripping response ignored deadline')
except BudgetExpired: pass
assert response.calls == 2
# A stream that closes early must not be accepted just because read1 returns EOF.
class TruncatedResponse:
  length = 4
  chunks = [b'abc', b'']
  def read1(self, size): return self.chunks.pop(0)
try:
  DownloadBudget(10, clock=lambda: 0).read(TruncatedResponse())
  raise AssertionError('truncated download accepted')
except http.client.IncompleteRead as error:
  assert error.partial == b'abc' and error.expected == 1
`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
