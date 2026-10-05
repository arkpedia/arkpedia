import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import { chapterRows, readerLink, type Section } from '@/lib/story/storyChapters';
import type { StoryLink } from '@/lib/story/storyMap';

/*
 * One chapter of the Story map, section by section, before reading it in Timo's reader: each
 * stage with its Before and After side by side (myrtle.moe's layout, the maintainer's choice),
 * and a story with neither on a row of its own. Every button opens that section in the reader,
 * in a new tab. The page opens it at /story?chapter=<group>, so a chapter can be linked.
 */
export default function ChapterDialog({ link, image, sections, onClose }: { link: StoryLink & { url: string; story: string }; image: string | null; sections: Section[]; onClose: () => void }) {
  const rows = chapterRows(sections);
  const stages = rows.filter((row) => row.before !== undefined || row.after !== undefined).length;
  const open = (index: number, label: string, kind: string) => (
    <a className={`ghost btn-sm story-chapter-${kind}`} href={readerLink(link.url, index)} target="_blank" rel="noopener noreferrer"
      aria-label={`${label} (opens Timo's reader in a new tab)`}>{kind === 'read' ? 'Read' : kind === 'before' ? 'Before' : 'After'}</a>
  );
  return (
    <ImportDialog title={link.title} className="story-chapter-dialog" onClose={onClose}>
      {image && <ContentImg className="story-chapter-art" src={`/${image}`} alt="" />}
      <div className="story-chapter-head">
        <span className="hint">{stages ? `${stages} stage${stages === 1 ? '' : 's'} · ` : ''}{sections.length} parts, in Timo&apos;s story reader</span>
        <a className="primary btn-sm" href={readerLink(link.url, sections[0]?.[0] ?? 0)} target="_blank" rel="noopener noreferrer">Read from the start <span aria-hidden="true">↗</span></a>
      </div>
      <ol className="story-chapter-rows">
        {rows.map((row) => {
          const label = `${row.code ? `${row.code} ` : ''}${row.name}`;
          return (
            <li key={`${row.code}-${row.name}-${row.before ?? row.after ?? row.read}`} className="story-chapter-row">
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
    </ImportDialog>
  );
}
