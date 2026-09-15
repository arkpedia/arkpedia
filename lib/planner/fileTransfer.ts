/**
 * Saving the planner to a real file, and reading one back.
 *
 * WHAT A WEB PAGE CANNOT DO, stated up front so nobody re-litigates it: it
 * cannot open Finder, Explorer or Nautilus, and it cannot learn the absolute
 * path of a file the reader chose. There is no API for either, `file://` links
 * are blocked from an https page by every browser, and the File System Access
 * handles expose `.name` and nothing else. A true "reveal in Finder" needs the
 * site to be a desktop app or to talk to a local helper.
 *
 * So there are two tiers, and the page shows only what the browser it is in can
 * actually do:
 *
 * TIER 1 -- File System Access (Chrome, Edge, Opera). A real OS save dialog, so
 * the reader chooses the folder; `id` makes the browser remember that folder
 * for this origin, so the next save and the next open both start there. And
 * `showDirectoryPicker({ startIn: handle })` opens a native folder browser AT
 * the export's own directory, which is as close to "show me where it went" as
 * the platform allows.
 *
 * TIER 2 -- everywhere else (Firefox, Safari). A download, which lands in the
 * browser's download folder, and an `<input type=file>` to read one back. The
 * page says so rather than offering a Show-folder button that would do nothing:
 * the browser's own download list is where the reveal-in-folder command lives.
 */

import { MAX_IMPORT_BYTES } from './untrusted';

interface FilePickerHandle {
  name: string;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
}

interface FilePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<FilePickerHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FilePickerHandle[]>;
  showDirectoryPicker?: (opts: unknown) => Promise<{ name: string }>;
}

/** One id for the whole feature, so save and open share a remembered folder. */
const PICKER_ID = 'arkpediaPlanner';

/** What Save offers, which is only what this writes. */
const SAVE_TYPES = [{ description: 'Arkpedia planner', accept: { 'application/json': ['.json'] } }];

/**
 * What Load will show, which is wider than what Save writes.
 *
 * Three other planners' exports can be read, and one of them -- Krooster's -- is
 * a CSV. Offering only .json here would grey it out in the dialog, so the format
 * would be supported by the parser and unreachable by the reader. Csv rather than
 * "all files" so the dialog is still a filter.
 */
const OPEN_TYPES = [{
  description: 'Planner file (Arkpedia, Krooster, ark-nights)',
  accept: { 'application/json': ['.json'], 'text/csv': ['.csv'] },
}];

function api(): FilePickerWindow {
  return (typeof window === 'undefined' ? {} : window) as unknown as FilePickerWindow;
}

/** Whether this browser can put a native file dialog on screen. */
export function hasFilePicker(): boolean {
  return typeof api().showSaveFilePicker === 'function';
}

/** Whether it can open a folder browser at a place we know. */
export function hasFolderPicker(): boolean {
  return typeof api().showDirectoryPicker === 'function';
}

export interface SaveResult {
  /** What it ended up called. Not a path -- the platform does not give one. */
  name: string;
  /** True when the reader picked the location themselves in an OS dialog. */
  chosen: boolean;
}

/**
 * Keeps the last file we wrote or read, so "show folder" and the next open have
 * somewhere to start. A handle, not a path: a handle is all there is.
 */
let lastHandle: FilePickerHandle | null = null;

export async function saveToFile(text: string, suggestedName: string): Promise<SaveResult | null> {
  const w = api();
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        id: PICKER_ID,
        suggestedName,
        /* Where the FIRST save starts, before the browser has a folder to
           remember. Documents rather than Downloads: this is a file you keep,
           not one you fetched. */
        startIn: lastHandle ?? 'documents',
        types: SAVE_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      lastHandle = handle;
      return { name: handle.name, chosen: true };
    } catch (err) {
      /* The reader cancelling the dialog is not a failure, and must not fall
         through to a silent download they did not ask for. */
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      /* Anything else -- a folder we cannot write to, a permission refused --
         falls back rather than leaving them with nothing. */
    }
  }

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Freed on the next turn of the event loop: revoking it synchronously can
     beat the navigation the click just started. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { name: suggestedName, chosen: false };
}

export interface LoadResult {
  name: string;
  text: string;
  /** The file was larger than MAX_IMPORT_BYTES and was NOT read: `text` is
   *  empty. Said here rather than by returning null, so the caller can tell
   *  "you cancelled" from "that is not a planner file". */
  tooLarge?: boolean;
}

/* Checked on the File's own size, before .text() -- reading a gigabyte into a
   string to then refuse it is the cost this avoids. */
function readChecked(file: File): Promise<LoadResult> {
  if (file.size > MAX_IMPORT_BYTES) return Promise.resolve({ name: file.name, text: '', tooLarge: true });
  return file.text().then((text) => ({ name: file.name, text }));
}

export async function loadFromFile(): Promise<LoadResult | null> {
  const w = api();
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        id: PICKER_ID,
        startIn: lastHandle ?? 'documents',
        types: OPEN_TYPES,
        multiple: false,
      });
      if (!handle) return null;
      const file = await handle.getFile();
      lastHandle = handle;
      return await readChecked(file);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
    }
  }

  /* The plain input, which every browser has. Appended to the document because
     Safari will not fire `change` on a detached one. */
  return new Promise<LoadResult | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/csv,.csv';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      readChecked(file).then(resolve).catch(() => resolve(null));
    });
    /* No `cancel` event in older browsers, so a dismissed dialog leaves this
       promise pending. Harmless -- nothing is awaiting a result that matters --
       and the input is removed either way on the next attempt. */
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    input.click();
  });
}

/**
 * Open the reader's file browser at the folder the export is in.
 *
 * The nearest honest thing to "show path". It is a directory picker, so the
 * browser will ask permission for the folder -- we ask for nothing beyond the
 * dialog and read nothing from the handle; the point is the native folder view
 * it puts on screen, at the right place.
 */
export async function showFolder(): Promise<boolean> {
  const w = api();
  if (!w.showDirectoryPicker) return false;
  try {
    await w.showDirectoryPicker({ id: PICKER_ID, startIn: lastHandle ?? 'documents', mode: 'read' });
    return true;
  } catch {
    return false;
  }
}

/** Whether a file has been saved or opened this visit, which is what makes
 *  "show folder" meaningful rather than a jump to Documents. */
export function hasLastFile(): boolean {
  return lastHandle !== null;
}
