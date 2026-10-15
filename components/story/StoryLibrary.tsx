import { useMemo } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { STORY_CATEGORIES, type StoryLibraryEntry } from '@/lib/story/storyLibrary';
import type { StoryMap } from '@/lib/story/storyMap';
import type { ChapterOpener } from './StoryMapView';

export default function StoryLibrary({ entries, map, chapters }: { entries: StoryLibraryEntry[]; map: StoryMap; chapters: ChapterOpener }) {
  const [query, setQuery] = useQueryState('q');
  const [category, setCategory] = useQueryState('category');
  const pictures = useMemo(() => new Map(map.elements.flatMap(element => element.type === 'picture' && element.link?.story && element.image ? [[element.link.story, element.image]] : [])), [map]);
  const all = useMemo(() => [...entries, ...(map.manga ?? []).map(comic => ({ id: comic.id, title: comic.title, url: comic.url, category: 'manga' as const }))], [entries, map]);
  const images = useMemo(() => new Map([...pictures, ...(map.manga ?? []).flatMap(comic => comic.image ? [[comic.id, comic.image] as const] : [])]), [pictures, map]);
  const options = [{ value: '', label: `All categories (${all.length})` }, ...STORY_CATEGORIES.map(([value, label]) => ({ value, label: `${label} (${all.filter(entry => entry.category === value).length})` }))];
  const needle = query.trim().toLocaleLowerCase();
  const groups = STORY_CATEGORIES.filter(([id]) => !category || category === id).map(([id, title]) => ({ id, title, entries: all.filter(entry => entry.category === id && (!needle || `${entry.title} ${entry.id}`.toLocaleLowerCase().includes(needle))) }));
  const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
  return <div className="story-library">
    <div className="story-library-tools">
      <StyledSelect label="Story category" value={category} onChange={setCategory} options={options} />
      <SearchInput className="story-library-search" label="Search stories" value={query} onChange={setQuery} placeholder="Search stories…" />
      <span className="hint story-library-count" role="status">{count} {count === 1 ? 'story' : 'stories'}</span>
    </div>
    {!count && <p className="hint" role="status">{all.length ? 'No stories match these filters.' : 'The story list is unavailable. Open Timo’s reader to browse the story.'} <button type="button" className="ghost btn-sm" onClick={() => { setQuery(''); setCategory(''); }}>Clear filters</button></p>}
    <div className="story-list-sections">
      {groups.filter(group => group.entries.length).map(group => <section key={group.id} className="story-list-section" aria-labelledby={`story-category-${group.id}`}>
        <h3 id={`story-category-${group.id}`}>{group.title} <span className="hint">{group.entries.length}</span></h3>
        <ul className="story-list">
          {group.entries.map(entry => {
            const popup = entry.category !== 'manga' && chapters.has(entry.id);
            const image = images.get(entry.id);
            const read = popup && chapters.isRead?.(entry.id);
            return <li key={entry.id}><a className={`story-list-card${entry.category === 'manga' ? ' is-manga' : ''}${read ? ' is-read' : ''}`}
              href={popup ? `/story?chapter=${encodeURIComponent(entry.id)}` : entry.url}
              target={popup ? undefined : '_blank'} rel={popup ? undefined : 'noopener noreferrer'}
              onClick={event => {
                if (!popup || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); chapters.open(entry.id);
              }}>
              {image && <ContentImg src={`/${image}`} alt="" />}
              <span className="story-list-title">{entry.title}{!popup && <span aria-label="opens in a new tab">↗</span>}</span>
              {popup && <span className="story-list-progress">{chapters.progressLabel?.(entry.id)}</span>}
            </a></li>;
          })}
        </ul>
      </section>)}
    </div>
  </div>;
}
