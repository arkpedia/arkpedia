import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import { chapterRows, readerLink, type Section } from '@/lib/story/storyChapters';
import type { StoryLink } from '@/lib/story/storyMap';
import { useState } from 'react';
import { readStoryProgress, setStoryPart, useStoryProgress, writeStoryProgress } from '@/lib/story/storyProgress';

/*
 * One chapter of the Story map, section by section, before reading it in Timo's reader: each
 * stage with its Before and After side by side (myrtle.moe's layout, the maintainer's choice),
 * and a story with neither on a row of its own. Every button opens that section in the reader,
 * in a new tab. The page opens it at /story?chapter=<group>, so a chapter can be linked.
 *
 * The chapter's cover is shown whole and centred above the chapter's line, at the board's own shape: `ratio` is
 * its box's width over height on the map, which is the picture's (the board's covers are 384px tall
 * at most, mostly portrait). Cropping them to a strip across the top cut off most of each one and
 * blew it up twice over; the ratio also holds the cover's place before it loads.
 */
export default function ChapterDialog({ link, image, sections, onClose }: { link: StoryLink & { url: string; story: string }; image: { src: string; ratio: number } | null; sections: Section[]; onClose: () => void }) {
  const progress = useStoryProgress();
  const [note, setNote] = useState('');
  const isRead = (index: number) => !!progress[link.story]?.includes(index);
  function mark(index: number, read: boolean) {
    try { writeStoryProgress(setStoryPart(readStoryProgress(window.localStorage), link.story, index, read)); setNote(''); }
    catch { setNote('This browser could not save your story progress.'); }
  }
  const rows = chapterRows(sections);
  const stages = rows.filter((row) => row.before !== undefined || row.after !== undefined).length;
  const open = (index: number, label: string, kind: string) => (
    <span className={`story-chapter-part story-chapter-${kind}`}>
      <button type="button" className="story-read-check" aria-label={`Mark ${label} as ${isRead(index) ? 'unread' : 'read'}`} aria-pressed={isRead(index)}
        onClick={() => { try { const latest = readStoryProgress(window.localStorage); writeStoryProgress(setStoryPart(latest, link.story, index, !latest[link.story]?.includes(index))); setNote(''); } catch { setNote('This browser could not save your story progress.'); } }}><span aria-hidden="true">✓</span></button>
      <a className="ghost btn-sm" href={readerLink(link.url, index)} target="_blank" rel="noopener noreferrer"
        onClick={() => mark(index, true)} onAuxClick={event => { if (event.button === 1) mark(index, true); }}
        aria-label={`${label} (opens Timo's reader in a new tab)`}>{kind === 'read' ? 'Read' : kind === 'before' ? 'Before' : 'After'}</a>
    </span>
  );
  return (
    <ImportDialog title={link.title} className="story-chapter-dialog" onClose={onClose}>
      <div className="story-chapter-top">
        {image && <ContentImg className="story-chapter-art" src={`/${image.src}`} alt="" style={{ aspectRatio: String(image.ratio) }} />}
        <div className="story-chapter-head">
          <span className="hint">{stages ? `${stages} stage${stages === 1 ? '' : 's'} · ` : ''}{sections.length} parts, in Timo&apos;s story reader</span>
          <div className="story-chapter-actions">
            <a className="primary btn-sm" href={readerLink(link.url, sections[0]?.[0] ?? 0)} target="_blank" rel="noopener noreferrer"
              onClick={() => { if (sections[0]) mark(sections[0][0], true); }} onAuxClick={event => { if (event.button === 1 && sections[0]) mark(sections[0][0], true); }}>Read from the start <span aria-hidden="true">↗</span></a>
            <div className="story-chapter-bulk">
            <button type="button" className="ghost btn-sm" onClick={() => {
              try {
                const latest = readStoryProgress(window.localStorage);
                writeStoryProgress({ ...latest, [link.story]: [...new Set([...(latest[link.story] ?? []), ...sections.map(([index]) => index)])] });
                setNote('');
              } catch { setNote('This browser could not save your story progress.'); }
            }}>Mark as read</button>
            <button type="button" className="ghost btn-sm" onClick={() => {
              try { const next = { ...readStoryProgress(window.localStorage) }; delete next[link.story]; writeStoryProgress(next); setNote(''); }
              catch { setNote('This browser could not save your story progress.'); }
            }}>Mark as unread</button>
            </div>
          </div>
        </div>
      </div>
      <ol className="story-chapter-rows">
        {rows.map((row) => {
          const label = `${row.code ? `${row.code} ` : ''}${row.name}`;
          const done = [row.read, row.before, row.after].filter((index): index is number => index !== undefined).every(isRead);
          return (
            <li key={`${row.code}-${row.name}-${row.before ?? row.after ?? row.read}`} className={`story-chapter-row${done ? ' is-read' : ''}`}>
              {row.code ? <span className="story-chapter-code">{row.code}</span> : <span className="story-chapter-code is-empty" aria-hidden="true" />}
              <span className="story-chapter-name">{row.name}</span>
              <span className="story-chapter-buttons">
                {row.read !== undefined && open(row.read, label, 'read')}
                {row.before !== undefined && open(row.before, `${label}, before the operation`, 'before')}
                {row.after !== undefined && open(row.after, `${label}, after the operation`, 'after')}
              </span>
            </li>
          );
        })}
      </ol>
      {note && <p className="hint" role="status">{note}</p>}
    </ImportDialog>
  );
}
