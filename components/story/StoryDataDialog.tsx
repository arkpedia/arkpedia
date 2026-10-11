import { useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { saveToFile } from '@/lib/planner/fileTransfer';
import { formatStoryFile, MAX_STORY_BYTES, parseStoryFile, readStoryProgress, storyFilename, writeStoryProgress } from '@/lib/story/storyProgress';

export default function StoryDataDialog({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  function importText(value: string) {
    try { writeStoryProgress(parseStoryFile(value)); setNote('Story progress imported.'); }
    catch (error) { setNote(error instanceof Error ? error.message : 'Story progress could not be saved.'); }
  }
  async function exportFile() {
    try {
      const saved = await saveToFile(formatStoryFile(readStoryProgress(window.localStorage)), storyFilename());
      setNote(saved ? `Saved ${saved.name}.` : 'Nothing saved.');
    } catch { setNote('Story progress could not be exported.'); }
  }
  return <ImportDialog title="Story progress" className="data-dialog" onClose={onClose}>
    <div className="data-dialog-body">
      <p className="hint">Importing replaces your story progress with the file’s read and unread states.</p>
      <div className="data-dialog-acts">
        <button type="button" className="ghost btn-sm" onClick={() => input.current?.click()}>Import file</button>
        <button type="button" className="primary btn-sm" onClick={() => void exportFile()}>Export story JSON</button>
      </div>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          if (file.size > MAX_STORY_BYTES) throw new Error('Choose a story progress file smaller than 2 MB.');
          importText(await file.text());
        } catch (error) { setNote(error instanceof Error ? error.message : 'This file could not be read.'); }
        finally { if (input.current) input.current.value = ''; }
      }} />
      <details className="data-dialog-paste"><summary>Paste / copy as text</summary>
        <textarea className="planner-depot-text" rows={4} aria-label="Story progress JSON" value={text} onChange={event => setText(event.target.value)} />
        <div className="data-dialog-acts">
          <button type="button" className="ghost btn-sm" disabled={!text.trim()} onClick={() => importText(text)}>Import text</button>
          <button type="button" className="ghost btn-sm" onClick={() => { try { setText(formatStoryFile(readStoryProgress(window.localStorage))); } catch { setNote('Story progress could not be read.'); } }}>Get story text</button>
        </div>
      </details>
      <p className="hint data-dialog-note" role="status">{note}</p>
    </div>
  </ImportDialog>;
}
