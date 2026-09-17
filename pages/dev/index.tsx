import { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';

const FILES = [
  'skins.json',
  'events/events_2020.json',
  'events/events_2021.json',
  'events/events_2022.json',
  'events/events_2023.json',
  'events/events_2024.json',
  'events/events_2025.json',
  'events/events_2026.json',
  'events/events_2027.json',
  'event_colors.json',
  'event_materials.json',
  'stage-guesser.json',
  'music-guesser-review.json',
  'techniques_definitions.json',
];

export default function DevConsole() {
  const [passcode, setPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [mode, setMode] = useState<'editor' | 'addEvent' | 'extractSkills'>('editor');

  const [selectedFile, setSelectedFile] = useState(FILES[0]);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    loadFile(selectedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, selectedFile]);

  async function loadFile(file: string) {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/dev/data?file=${file}`, {
        headers: { 'x-dev-passcode': passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setContent(data.content);
    } catch (e) {
      setStatus(`Error loading: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveFile() {
    setStatus(null);
    try {
      JSON.parse(content);
    } catch (e) {
      setStatus(`Not valid JSON: ${(e as Error).message}`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/dev/data?file=${selectedFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-passcode': passcode },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus('Saved to disk.');
    } catch (e) {
      setStatus(`Error saving: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  const [evName, setEvName] = useState('');
  const [evYear, setEvYear] = useState(new Date().getFullYear());
  const [evPoster, setEvPoster] = useState(''); // resolved local path, set after upload completes
  const [evPosterUploading, setEvPosterUploading] = useState(false);
  const [evGlobalRange, setEvGlobalRange] = useState('');
  const [evMaterials, setEvMaterials] = useState('');
  const [evSkins, setEvSkins] = useState<string[]>([]); // names of skins already added/linked this session
  const [evPulls, setEvPulls] = useState('');
  const [evStatus, setEvStatus] = useState<string | null>(null);

  // --- Extract Skills state ---
  const FACILITIES = ['Factory', 'Trading Post', 'Control Center', 'Office', 'Reception Room', 'Dormitory', 'Power Plant'];
  const [selectedFacility, setSelectedFacility] = useState(FACILITIES[0]);
  const [extractedSkills, setExtractedSkills] = useState<
    { operator: string; skillName: string | null; eliteLevel: string | null; description: string | null }[] | null
  >(null);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);

  async function loadFacilitySkills(facility: string) {
    setExtractLoading(true);
    setExtractStatus(null);
    try {
      const res = await fetch(`/api/dev/extract-skills?facility=${encodeURIComponent(facility)}`, {
        headers: { 'x-dev-passcode': passcode },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExtractedSkills(data.skills);
    } catch (e) {
      setExtractStatus(`Error: ${(e as Error).message}`);
    } finally {
      setExtractLoading(false);
    }
  }

  // New-skin mini-form (for skins that don't exist in skins.json yet)
  const [newSkinName, setNewSkinName] = useState('');
  const [newSkinImage, setNewSkinImage] = useState('');
  const [newSkinUploading, setNewSkinUploading] = useState(false);
  const [newSkinStatus, setNewSkinStatus] = useState<string | null>(null);

  async function uploadFile(file: File, folder: 'event-posters' | 'skin-images'): Promise<string> {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/dev/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-passcode': passcode },
      body: JSON.stringify({ folder, filename: file.name, dataBase64 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.path as string;
  }

  async function handlePosterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEvPosterUploading(true);
    setEvStatus(null);
    try {
      const savedPath = await uploadFile(file, 'event-posters');
      setEvPoster(savedPath);
    } catch (err) {
      setEvStatus(`Upload failed: ${(err as Error).message}`);
    } finally {
      setEvPosterUploading(false);
    }
  }

  async function handleNewSkinImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewSkinUploading(true);
    setNewSkinStatus(null);
    try {
      const savedPath = await uploadFile(file, 'skin-images');
      setNewSkinImage(savedPath);
    } catch (err) {
      setNewSkinStatus(`Upload failed: ${(err as Error).message}`);
    } finally {
      setNewSkinUploading(false);
    }
  }

  async function addNewSkin() {
    setNewSkinStatus(null);
    if (!newSkinName.trim()) {
      setNewSkinStatus('Name is required.');
      return;
    }
    try {
      const res = await fetch('/api/dev/add-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-passcode': passcode },
        body: JSON.stringify({ name: newSkinName.trim(), image: newSkinImage || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvSkins((prev) => [...prev, newSkinName.trim()]);
      setNewSkinStatus(`Added "${newSkinName}" and linked it to this event.`);
      setNewSkinName('');
      setNewSkinImage('');
    } catch (err) {
      setNewSkinStatus(`Error: ${(err as Error).message}`);
    }
  }

  async function submitEvent() {
    setEvStatus(null);
    if (!evName.trim()) {
      setEvStatus('Name is required.');
      return;
    }
    try {
      const res = await fetch('/api/dev/add-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-passcode': passcode },
        body: JSON.stringify({
          name: evName.trim(),
          year: evYear,
          poster: evPoster || null,
          global: { dateRange: evGlobalRange.trim() || null, note: null },
          cn: { dateRange: null, note: null },
          tw: { dateRange: null, note: null },
          materials: evMaterials.split(',').map((m) => m.trim()).filter(Boolean),
          linkedSkinNames: evSkins,
          pullsNeeded: evPulls ? Number(evPulls) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvStatus(`Saved "${evName}" to ${data.file}.`);
      setEvName('');
      setEvPoster('');
      setEvGlobalRange('');
      setEvMaterials('');
      setEvSkins([]);
      setEvPulls('');
    } catch (e) {
      setEvStatus(`Error: ${(e as Error).message}`);
    }
  }

  if (!unlocked) {
    return (
      <main style={{ maxWidth: 360, margin: '80px auto' }}>
        <h1>Dev Console</h1>
        <p className="hint" style={{ marginBottom: 12 }}>
          Local development only -- this does nothing useful on the deployed site.
        </p>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="guesser-input"
          style={{ marginBottom: 10, width: '100%' }}
        />
        <button type="button" className="primary" onClick={() => setUnlocked(true)}>
          Enter
        </button>
      </main>
    );
  }

  return (
    <>
      <Head><title>Dev Console — Arkpedia</title></Head>
      <main style={{ maxWidth: 900, margin: '40px auto' }}>
      <h1>Dev Console</h1>
      <p className="hint" style={{ marginBottom: 16 }}>
        Edits write directly to your local <code>data/</code> files. Commit and push the changed
        files, then publish a content release for changes to appear on the live site.
      </p>

      <div className="stages-category-row" style={{ marginBottom: 20 }}>
        <button type="button" className={mode === 'editor' ? 'primary' : 'ghost'} onClick={() => setMode('editor')}>
          Raw JSON Editor
        </button>
        <button type="button" className={mode === 'addEvent' ? 'primary' : 'ghost'} onClick={() => setMode('addEvent')}>
          Add Future Event
        </button>
        <button
          type="button"
          className={mode === 'extractSkills' ? 'primary' : 'ghost'}
          onClick={() => {
            setMode('extractSkills');
            loadFacilitySkills(selectedFacility);
          }}
        >
          Extract Facility Skills
        </button>
      </div>

      {mode === 'editor' && (
        <section className="op-section">
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="schedule-year-select"
            style={{ marginBottom: 12 }}
          >
            {FILES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: '60vh',
              fontFamily: 'monospace',
              fontSize: 12,
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
              borderRadius: 4,
              padding: 12,
            }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button type="button" className="primary" onClick={saveFile} disabled={loading}>
              Save
            </button>
            <button type="button" className="ghost" onClick={() => loadFile(selectedFile)} disabled={loading}>
              Reload (discard changes)
            </button>
            {status && <span className="hint">{status}</span>}
          </div>
        </section>
      )}

      {mode === 'addEvent' && (
        <section className="op-section">
          <p className="hint" style={{ marginBottom: 14 }}>
            Skins and materials can&apos;t be auto-matched for an event that hasn&apos;t released
            yet -- list them manually here (comma-separated). Once the event actually releases and
            gets properly scraped, real skin matching takes over automatically instead.
          </p>

          <label className="hint">Event name</label>
          <input className="guesser-input" style={{ width: '100%', marginBottom: 10 }} value={evName} onChange={(e) => setEvName(e.target.value)} />

          <label className="hint">Year</label>
          <input
            type="number"
            className="guesser-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={evYear}
            onChange={(e) => setEvYear(Number(e.target.value))}
          />

          <label className="hint">Poster image</label>
          <input type="file" accept="image/*" onChange={handlePosterUpload} style={{ marginBottom: 4, display: 'block' }} />
          {evPosterUploading && <p className="hint">Uploading...</p>}
          {evPoster && !evPosterUploading && (
            <div style={{ marginBottom: 10 }}>
              <Image src={evPoster} alt="Poster preview" width={800} height={450} style={{ maxWidth: 200, width: 'auto', height: 'auto', borderRadius: 4, display: 'block' }} />
              <span className="hint">{evPoster}</span>
            </div>
          )}

          <label className="hint">Global date range (e.g. 2027/01/16–2027/02/06)</label>
          <input
            className="guesser-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={evGlobalRange}
            onChange={(e) => setEvGlobalRange(e.target.value)}
          />

          <label className="hint">Materials to farm (comma-separated, must match icon filenames in material-icons/)</label>
          <input className="guesser-input" style={{ width: '100%', marginBottom: 16 }} value={evMaterials} onChange={(e) => setEvMaterials(e.target.value)} />

          <div className="waiting-box" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15 }}>Add a skin for this event</h2>
            <p className="hint" style={{ marginBottom: 10 }}>
              For skins that don&apos;t exist in skins.json yet -- creates a minimal entry and links
              it to this event. Once the event actually releases and gets properly scraped, this
              stub gets overwritten by the real scraped data automatically (same name = same entry).
            </p>
            <label className="hint">Skin name</label>
            <input className="guesser-input" style={{ width: '100%', marginBottom: 8 }} value={newSkinName} onChange={(e) => setNewSkinName(e.target.value)} />
            <label className="hint">Skin image</label>
            <input type="file" accept="image/*" onChange={handleNewSkinImageUpload} style={{ marginBottom: 4, display: 'block' }} />
            {newSkinUploading && <p className="hint">Uploading...</p>}
            {newSkinImage && !newSkinUploading && (
              <Image src={newSkinImage} alt="Skin preview" width={800} height={450} style={{ maxWidth: 120, width: 'auto', height: 'auto', borderRadius: 4, display: 'block', marginBottom: 8 }} />
            )}
            <button type="button" className="ghost" onClick={addNewSkin}>
              Add Skin
            </button>
            {newSkinStatus && <p className="hint" style={{ marginTop: 8 }}>{newSkinStatus}</p>}
          </div>

          {evSkins.length > 0 && (
            <p className="hint" style={{ marginBottom: 10 }}>
              Linked skins for this event: {evSkins.join(', ')}
            </p>
          )}

          <label className="hint">Pulls needed (optional)</label>
          <input
            type="number"
            className="guesser-input"
            style={{ width: '100%', marginBottom: 14 }}
            value={evPulls}
            onChange={(e) => setEvPulls(e.target.value)}
          />

          <button type="button" className="primary" onClick={submitEvent}>
            Add Event
          </button>
          {evStatus && <p className="hint" style={{ marginTop: 10 }}>{evStatus}</p>}
        </section>
      )}

      {mode === 'extractSkills' && (
        <section className="op-section">
          <p className="hint" style={{ marginBottom: 14 }}>
            Every operator&apos;s base skill for the selected facility, pulled straight from your
            scraped operator data. Copy out one entry at a time to send over for review.
          </p>

          <div className="stages-category-row" style={{ marginBottom: 14 }}>
            {FACILITIES.map((f) => (
              <button
                key={f}
                type="button"
                className={selectedFacility === f ? 'primary' : 'ghost'}
                onClick={() => {
                  setSelectedFacility(f);
                  loadFacilitySkills(f);
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {extractLoading && <p className="hint">Loading...</p>}
          {extractStatus && <p className="hint">{extractStatus}</p>}

          {extractedSkills && !extractLoading && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                {extractedSkills.length} skill{extractedSkills.length === 1 ? '' : 's'} found for{' '}
                {selectedFacility}.
              </p>

              <button
                type="button"
                className="ghost"
                style={{ marginBottom: 10 }}
                onClick={async () => {
                  const text = extractedSkills
                    .map(
                      (s) =>
                        `${s.operator}${s.eliteLevel ? ` (${s.eliteLevel})` : ''}\n${s.skillName}\n${s.description}`
                    )
                    .join('\n\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    setExtractStatus('Copied to clipboard.');
                  } catch {
                    setExtractStatus('Clipboard blocked -- select all the text below and copy manually instead.');
                  }
                }}
              >
                Copy all to clipboard
              </button>

              <textarea
                readOnly
                value={extractedSkills
                  .map(
                    (s) =>
                      `${s.operator}${s.eliteLevel ? ` (${s.eliteLevel})` : ''}\n${s.skillName}\n${s.description}`
                  )
                  .join('\n\n')}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                style={{
                  width: '100%',
                  height: 200,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  padding: 10,
                  marginBottom: 16,
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {extractedSkills.map((s, i) => (
                  <div key={i} className="waiting-box" style={{ padding: 12 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
                      {s.operator} {s.eliteLevel ? `(${s.eliteLevel})` : ''}
                    </p>
                    <p className="hint" style={{ margin: '0 0 4px' }}>{s.skillName}</p>
                    <p style={{ margin: 0, fontSize: 13 }}>{s.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
    </>
  );
}
