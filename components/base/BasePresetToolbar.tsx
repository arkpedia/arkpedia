import { useEffect, useRef, useState } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import type { SavedBasePreset } from '@/lib/base/baseSavedPresets';

/** Keep setup actions beside the map; naming and management never resize the board. */
export default function BasePresetToolbar({ presets, selected, dirty, status, onLoad, onSave, onRename, onDelete, onClear }: {
  presets: SavedBasePreset[]; selected: string; dirty: boolean; status: string;
  onLoad: (id: string) => void; onSave: (name?: string) => boolean;
  onRename: (name: string) => boolean; onDelete: () => void; onClear: () => void;
}) {
  const naming = useAnchoredPopover(320), management = useAnchoredPopover(200);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preset = presets.find(p => p.id === selected);
  useEffect(() => { if (naming.open) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [naming.open]);
  useEffect(() => { if (management.open) management.menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, [management.open, management.menuRef]);
  function closeNaming() { naming.close(); naming.buttonRef.current?.focus({ preventScroll: true }); }
  return <section className="base-preset-toolbar" aria-label="Base presets">
    <div className="base-preset-controls">
      <label className="base-preset-picker">Setup <StyledSelect label="Saved preset" placeholder={presets.length ? 'Choose a preset' : 'Unsaved setup'} value={selected} onChange={onLoad} options={presets.map(p => ({ value: p.id, label: p.name }))} /></label>
      <button type="button" className="ghost" disabled={!preset || !dirty} onClick={() => onSave()}>Save changes</button>
      <button ref={naming.buttonRef} type="button" className="ghost" aria-expanded={naming.open} aria-controls="base-preset-name-editor" onClick={() => { management.close(); setRenaming(false); setName(''); naming.setOpen(!naming.open); }}>Save as</button>
      <button type="button" className="danger" onClick={() => { naming.close(); management.close(); onClear(); }}>Clear base</button>
      <button ref={management.buttonRef} type="button" className="ghost btn-icon" aria-label="Preset actions" disabled={!preset} aria-expanded={management.open} aria-controls="base-preset-management" onClick={() => { naming.close(); management.setOpen(!management.open); }}>•••</button>
    </div>
    <div className="base-preset-feedback"><span className="base-preset-state">{preset ? dirty ? 'Unsaved changes' : 'Saved setup' : 'Unsaved setup'}</span><span className="hint base-preset-message" role="status" aria-live="polite" title={status}>{status}</span></div>
    {naming.open && <div ref={naming.menuRef} id="base-preset-name-editor" className="base-preset-popover" role="region" aria-label={renaming ? 'Rename preset' : 'Save preset'} style={naming.menuStyle}>
      <form onSubmit={event => { event.preventDefault(); if (renaming ? onRename(name) : onSave(name)) closeNaming(); }}>
        <label>{renaming ? 'Preset name' : 'New preset'}<input ref={input} type="text" maxLength={80} value={name} placeholder="e.g. Gold team" onChange={event => setName(event.target.value)} /></label>
        <div className="base-chip-row"><button type="submit" className="primary btn-sm" disabled={!name.trim()}>{renaming ? 'Rename' : 'Save new'}</button><button type="button" className="ghost" onClick={closeNaming}>Cancel</button></div>
      </form>
    </div>}
    {management.open && <div ref={management.menuRef} id="base-preset-management" className="base-preset-popover base-preset-management" role="group" aria-label="Manage preset" style={management.menuStyle}>
      <button type="button" className="ghost" disabled={!dirty} onClick={() => { management.close(); onLoad(selected); naming.buttonRef.current?.focus({ preventScroll: true }); }}>Reload saved setup</button>
      <button type="button" className="ghost" onClick={() => { management.close(); setRenaming(true); setName(preset?.name ?? ''); naming.setOpen(true); }}>Rename</button>
      <button type="button" className="danger" onClick={() => { management.close(); onDelete(); naming.buttonRef.current?.focus({ preventScroll: true }); }}>Delete</button>
    </div>}
  </section>;
}
