'use strict';
const $ = (id) => document.getElementById(id);
const roles = ['Hair', 'Clothing 1', 'Clothing 2', 'Skin / clothing 3', 'Accent / item'];
let catalog = [], details = null, samples = Array(5).fill(null), labels = Array(5).fill('');
let selected = 0, dirty = false, busy = false, generation = 0;
let phase = 'quick', lastDecision = null;
const prepared = new Map();
const needsAdjustment = item => ['declined', 'flagged', 'draft', 'stale'].includes(item.status);
function inPhase(item) {
  return phase === 'quick' ? item.status === 'unreviewed' : phase === 'adjust' ? needsAdjustment(item) : true;
}
function prepareArtwork(key) {
  if (!prepared.has(key)) {
    const task = (async () => {
      const data = await api(`/api/details?key=${encodeURIComponent(key)}`);
      const image = new Image(); image.src = `/api/art?key=${encodeURIComponent(key)}&v=${data.sourceSha256}`;
      await image.decode(); return { data, image };
    })();
    prepared.set(key, task);
    task.catch(() => { if (prepared.get(key) === task) prepared.delete(key); });
    while (prepared.size > 3) prepared.delete(prepared.keys().next().value);
  }
  return prepared.get(key);
}
function prefetchNext() {
  if (phase !== 'quick' || !details) return;
  const list = filtered(), index = list.findIndex(item => item.key === details.key);
  for (const item of list.slice(index + 1, index + 3)) prepareArtwork(item.key).catch(() => {});
}
const canvas = $('art'), context = canvas.getContext('2d', { willReadFrequently: true });
const message = (text, error = false) => { $('message').textContent = text; $('message').classList.toggle('error', error); };
async function api(path, payload) {
  const response = await fetch(path, payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function filtered() {
  const query = $('search').value.trim().toLocaleLowerCase();
  return catalog.filter(item => inPhase(item) && item.name.toLocaleLowerCase().includes(query) &&
    (!$('mode').value || item.mode === $('mode').value) && (!$('status').value || item.status === $('status').value));
}
function renderQueue() {
  const items = filtered();
  $('matches').textContent = `${items.length} artworks shown`;
  const accepted = catalog.filter(item => ['approved', 'accepted'].includes(item.status)).length;
  const remaining = catalog.filter(item => item.status === 'unreviewed').length;
  const adjustments = catalog.filter(needsAdjustment).length;
  $('progress').textContent = `${accepted} accepted · ${remaining} to review`;
  $('declined-count').textContent = `(${adjustments})`;
  $('queue').replaceChildren(...items.map(item => {
    const li = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.textContent = `${item.name} · ${item.mode}`;
    const status = document.createElement('small'); status.textContent = item.status === 'stale' ? 'Artwork changed' : item.status;
    button.append(status); button.setAttribute('aria-current', String(details?.key === item.key));
    button.disabled = busy;
    button.addEventListener('click', () => openArtwork(item.key)); li.append(button); return li;
  }));
}
function fitArtwork() {
  if (!canvas.width || !details) return;
  const area = $('art-scroll');
  const scale = Math.min((area.clientWidth - 24) / canvas.width, (area.clientHeight - 24) / canvas.height);
  $('art-wrap').style.width = `${canvas.width * Math.min(1, scale) * Number($('zoom').value)}px`;
}
function renderMarkers() {
  $('markers').replaceChildren(...samples.flatMap((sample, index) => {
    if (!sample) return [];
    const marker = document.createElement('span'); marker.className = index === selected ? 'marker selected' : 'marker';
    marker.textContent = index + 1;
    marker.style.left = `${100 * (sample.x - details.bounds[0] + .5) / canvas.width}%`;
    marker.style.top = `${100 * (sample.y - details.bounds[1] + .5) / canvas.height}%`;
    return [marker];
  }));
}
function updateActions() {
  for (const input of document.querySelectorAll('#editor input, #editor textarea, #editor select, .slot-select')) input.disabled = busy;
  $('accept').disabled = $('decline').disabled = busy || !details || !catalog.some(item => item.key === details.key && inPhase(item));
  $('undo').disabled = busy || !lastDecision;
  for (const id of ['step-quick', 'step-adjust', 'step-all']) $(id).disabled = busy;
  const ready = samples.every((sample, i) => sample && labels[i].trim());
  $('approve').disabled = busy || !ready;
  $('save').disabled = $('flag').disabled = $('apply').disabled = busy;
  $('sample-position').disabled = busy;
  $('previous').disabled = $('next').disabled = busy;
  $('approval-hint').textContent = ready ? 'All five samples are recorded. Check each feature before approving.' : 'Sample and describe all five features to approve.';
}
function renderSlots() {
  $('slots').replaceChildren(...roles.map((role, index) => {
    const li = document.createElement('li'); li.className = 'slot'; li.classList.toggle('selected', index === selected);
    const button = document.createElement('button'); button.className = 'slot-select'; button.type = 'button';
    button.setAttribute('aria-pressed', String(index === selected));
    const chip = document.createElement('span'); chip.className = 'sample-chip'; chip.style.background = samples[index]?.color || 'transparent';
    const title = document.createElement('span'); title.textContent = `${index + 1}. ${role}`;
    button.append(chip, title); button.addEventListener('click', () => { selected = index; renderSlots(); renderMarkers(); });
    const value = document.createElement('code'); value.textContent = samples[index] ? `${samples[index].color} · (${samples[index].x}, ${samples[index].y})` : 'No source sample yet';
    const label = document.createElement('label'); label.htmlFor = `label-${index}`; label.textContent = 'Feature description';
    const input = document.createElement('input'); input.id = label.htmlFor; input.maxLength = 100; input.value = labels[index]; input.placeholder = `Describe the ${role.toLowerCase()}`;
    input.addEventListener('input', () => { labels[index] = input.value; dirty = true; updateActions(); });
    li.append(button, value, label, input); return li;
  }));
  updateActions();
}
function renderColors() {
  for (const id of ['current-palette', 'quick-palette']) $(id).replaceChildren(...details.colors.map((color, index) => {
    const chip = document.createElement('span'); chip.style.background = color; chip.title = `${index + 1}. ${roles[index]}: ${color}`; chip.setAttribute('role', 'img'); chip.setAttribute('aria-label', chip.title); return chip;
  }));
  $('review-status').textContent = details.stale ? 'Artwork changed — sample the features again.' : `Status: ${details.review?.status || 'unreviewed'}`;
}
async function openArtwork(key) {
  if (busy || (dirty && !window.confirm('Discard unsaved changes to this palette?'))) return;
  const request = ++generation;
  busy = true; updateActions(); renderQueue();
  try {
    if (phase !== 'quick') prepared.delete(key);
    const { data: next, image } = await prepareArtwork(key);
    if (request !== generation) return;
    details = next;
    samples = next.review?.samples && !next.stale ? next.review.samples.map(s => s && { ...s }) : Array(5).fill(null);
    labels = samples.map((s, i) => s?.label || next.review?.labels?.[i] || '');
    $('notes').value = next.review?.notes || ''; dirty = false; selected = 0;
    const item = catalog.find(item => item.key === key);
    $('title').textContent = `${item.name} / ${item.mode}`;
    $('editor').hidden = false; $('complete').hidden = true;
    const [x, y, right, bottom] = next.bounds;
    canvas.width = right - x; canvas.height = bottom - y;
    context.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    $('zoom').value = '1'; $('art-scroll').scrollTo(0, 0);
    renderColors(); renderSlots(); renderMarkers(); fitArtwork();
    history.replaceState(null, '', `#${encodeURIComponent(key)}`);
    message(next.stale ? 'The source artwork changed. Previous samples need a fresh review.' : '');
    prefetchNext();
    return true;
  } catch (error) { message(error.message, true); return false; }
  finally { busy = false; updateActions(); renderQueue(); }
}
function position(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.floor((event.clientX - rect.left) * canvas.width / rect.width) + details.bounds[0],
    y: Math.floor((event.clientY - rect.top) * canvas.height / rect.height) + details.bounds[1] };
}
async function samplePosition(x, y) {
  if (!details || busy || phase === 'quick') return;
  const key = details.key, slot = selected;
  busy = true; updateActions();
  try {
    const sample = await api(`/api/pixel?key=${encodeURIComponent(key)}&x=${x}&y=${y}`);
    if (details.key !== key) return;
    samples[slot] = { ...sample, label: labels[slot] }; dirty = true;
    $('sample-x').value = x; $('sample-y').value = y;
    renderSlots(); renderMarkers(); message(`${roles[slot]} sampled: ${sample.color}.`);
  } catch (error) { message(error.message, true); }
  finally { busy = false; updateActions(); }
}
canvas.addEventListener('click', event => { const { x, y } = position(event); samplePosition(x, y); });
canvas.addEventListener('mousemove', event => {
  if (!details || phase === 'quick') return;
  const { x, y } = position(event), cx = x - details.bounds[0], cy = y - details.bounds[1];
  if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return;
  const magnifier = $('magnifier').getContext('2d'); magnifier.clearRect(0, 0, 99, 99); magnifier.imageSmoothingEnabled = false;
  magnifier.drawImage(canvas, cx - 4, cy - 4, 9, 9, 0, 0, 99, 99);
  magnifier.strokeStyle = '#000'; magnifier.lineWidth = 3; magnifier.strokeRect(44, 44, 11, 11);
  magnifier.strokeStyle = '#fff'; magnifier.lineWidth = 1; magnifier.strokeRect(44, 44, 11, 11);
  $('pixel').textContent = `Original pixel: ${x}, ${y}. Click to sample ${roles[selected].toLowerCase()}.`;
});
async function save(status) {
  if (!details || busy) return;
  busy = true; updateActions(); renderQueue();
  try {
    details.review = await api('/api/save', { key: details.key, previousUpdatedAt: details.review?.updatedAt,
      review: { sourceSha256: details.sourceSha256, status, samples: samples.map((s, i) => s && { ...s, label: labels[i] }), labels, notes: $('notes').value } });
    details.stale = false; dirty = false; prepared.delete(details.key);
    catalog = await api('/api/catalog'); renderColors(); message(`Saved locally as ${status}.`);
    if (status === 'approved' && phase === 'adjust') {
      busy = false;
      const next = filtered().find(item => item.key !== details.key);
      if (next) await openArtwork(next.key); else showComplete();
    }
  } catch (error) { message(error.message, true); }
  finally { busy = false; updateActions(); renderQueue(); }
}
$('save').addEventListener('click', () => save('draft'));
$('flag').addEventListener('click', () => save('flagged'));
$('approve').addEventListener('click', () => save('approved'));
$('notes').addEventListener('input', () => { dirty = true; });
$('sample-position').addEventListener('click', () => samplePosition(Number($('sample-x').value), Number($('sample-y').value)));
$('apply').addEventListener('click', async () => {
  if (busy) return;
  if (dirty) return message('Save your current review before applying palettes.', true);
  busy = true; updateActions(); renderQueue();
  try {
    const result = await api('/api/apply', {});
    catalog = await api('/api/catalog');
    if (details) { details = await api(`/api/details?key=${encodeURIComponent(details.key)}`); renderColors(); }
    message(result.message);
  } catch (error) { message(error.message, true); }
  finally { busy = false; updateActions(); renderQueue(); }
});
function showComplete() {
  details = null; $('editor').hidden = true; $('complete').hidden = false;
  const adjustments = catalog.filter(needsAdjustment).length;
  $('complete-title').textContent = phase === 'quick' ? 'First pass complete' : 'No palettes waiting here';
  $('complete-text').textContent = adjustments ? `${adjustments} palettes are ready for a closer look in step 2.` : 'All current palettes have been reviewed. You can revisit them in All palettes.';
  $('go-adjust').hidden = !adjustments || phase === 'adjust';
  message(''); updateActions(); renderQueue();
}
async function switchPhase(nextPhase) {
  if (busy || (dirty && !window.confirm('Discard unsaved changes to this palette?'))) return;
  dirty = false; phase = nextPhase;
  document.body.classList.toggle('quick', phase === 'quick');
  for (const [id, value] of [['step-quick', 'quick'], ['step-adjust', 'adjust'], ['step-all', 'all']]) $(id).setAttribute('aria-pressed', String(phase === value));
  $('search').value = $('mode').value = $('status').value = '';
  prepared.clear(); renderQueue();
  const items = filtered(), first = items.find(item => item.key === details?.key) || items[0];
  if (first) await openArtwork(first.key); else showComplete();
}
for (const [id, value] of [['step-quick', 'quick'], ['step-adjust', 'adjust'], ['step-all', 'all'], ['go-adjust', 'adjust']]) $(id).addEventListener('click', () => switchPhase(value));
async function decide(decision) {
  if (busy || !details || phase !== 'quick') return;
  busy = true; updateActions();
  const key = details.key;
  const list = filtered(), index = list.findIndex(item => item.key === key);
  try {
    const review = await api('/api/decision', { key, decision, previousUpdatedAt: details.review?.updatedAt, sourceSha256: details.sourceSha256, colors: details.colors });
    details.review = review; lastDecision = { key, updatedAt: review.updatedAt }; prepared.delete(key);
    catalog = await api('/api/catalog');
    const candidates = [...list.slice(index + 1), ...list.slice(0, index)];
    const next = candidates.find(item => catalog.some(current => current.key === item.key && inPhase(current)));
    busy = false;
    if (next) { if (!await openArtwork(next.key)) return; } else showComplete();
    const name = catalog.find(item => item.key === key).name;
    message(`${name}: ${decision === 'accept' ? 'accepted' : 'saved for adjustment'}.`);
  } catch (error) { message(error.message, true); }
  finally { busy = false; updateActions(); renderQueue(); }
}
$('accept').addEventListener('click', () => decide('accept'));
$('decline').addEventListener('click', () => decide('decline'));
$('undo').addEventListener('click', async () => {
  if (busy || !lastDecision || (dirty && !window.confirm('Discard unsaved edits and undo the last choice?'))) return;
  busy = true; updateActions();
  try {
    const { key } = await api('/api/undo', lastDecision);
    dirty = false; lastDecision = null; prepared.delete(key); catalog = await api('/api/catalog');
    busy = false; await switchPhase('quick');
    if (details?.key !== key) await openArtwork(key);
    message('Last choice undone.');
  } catch (error) { message(error.message, true); }
  finally { busy = false; updateActions(); renderQueue(); }
});
window.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (phase === 'quick' && !busy && details && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); decide(event.key === 'ArrowRight' ? 'accept' : 'decline');
  }
});
for (const id of ['search', 'mode', 'status']) $(id).addEventListener('input', renderQueue);
for (const [id, direction] of [['previous', -1], ['next', 1]]) $(id).addEventListener('click', () => {
  const items = filtered(); if (!items.length) return;
  const index = items.findIndex(item => item.key === details?.key);
  openArtwork(items[(index + direction + items.length) % items.length].key);
});
$('zoom').addEventListener('change', fitArtwork);
$('background').addEventListener('change', () => { $('art-scroll').classList.toggle('light', $('background').value === 'light'); });
new ResizeObserver(fitArtwork).observe($('art-scroll'));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
(async () => {
  try {
    catalog = await api('/api/catalog'); renderQueue();
    let hash = ''; try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* Ignore malformed links. */ }
    const items = filtered();
    const first = items.find(item => item.key === hash) || items[0];
    if (first) await openArtwork(first.key); else showComplete();
  } catch (error) { message(error.message, true); }
})();
