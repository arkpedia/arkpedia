import { useRef, useMemo, useState } from 'react';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { resolveStageAnswer, searchStageAnswers, StageAnswer as Answer, StageSearchMode } from '@/lib/minigames/stageGuesser';
import common from '@/styles/games/minigames.module.css';
import styles from '@/styles/games/stage-guesser.module.css';

export default function StageAnswer({ stages, onGuess, mode, onModeChange, onTypingChange }: { stages: Answer[]; onGuess: (slug: string) => void; mode: StageSearchMode; onTypingChange: (typing: boolean) => void; onModeChange: (mode: StageSearchMode) => void }) {
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => searchStageAnswers(input, stages, mode), [input, stages, mode]);
  function choose(stage: Answer) {
    onGuess(stage.slug); setInput(''); setNotice('');
    inputRef.current?.focus({ preventScroll: true });
  }
  return <form className={`${common.answerForm} ${styles.answerForm}`} onSubmit={(event) => {
    event.preventDefault();
    const stage = resolveStageAnswer(input, stages);
    if (stage) choose(stage);
    else setNotice('Choose a stage from the suggestions. No guess used.');
  }}>
    <label htmlFor="stage-answer">{mode === 'connections' ? 'Stage, event or chapter' : 'Stage code or name'}</label>
    {/* Focus bubbles in React: focusing the field is what starts the phone's typing
        view (the map, the field and the list fitted above the keyboard). */}
    <div className={styles.search} onFocus={() => onTypingChange(true)}>
      <SearchInput id="stage-answer" inputRef={inputRef} label={mode === 'connections' ? 'Stage, event or chapter' : 'Stage code or name'}
        value={input} onChange={(value) => { setInput(value); setNotice(''); }}
        placeholder={mode === 'connections' ? 'Stage, Under Tides, chapter 8…' : 'Type a code or stage title…'}
        suggestions={suggestions} getKey={(stage) => stage.slug}
        renderSuggestion={(stage) => <span className={styles.stageOption}><strong>{stage.code}</strong><span>{stage.name}</span>{mode === 'connections' && <small>{stage.source}</small>}</span>}
        onPick={choose} suggestLabel="Stage suggestions" emptyText="No stages match this search." />
    </div>
    <button className="primary" type="submit" disabled={!input.trim()}>Guess stage</button>
    <details className={`${common.disclosure} ${styles.searchSettings}`}>
      <summary>Search settings</summary>
      <div className={styles.searchModes}>
        <SegmentedControl label="Answer search" value={mode}
          options={[{ value: 'stages', label: 'Codes & titles' }, { value: 'connections', label: 'Events & chapters' }]}
          onChange={(next) => { onModeChange(next); setNotice(''); }} />
        <p className={styles.searchHelp} id="stage-search-help">{mode === 'connections' ? 'Try “Under Tides” or “chapter 8”, then choose a stage. Searches all Global stages.' : 'Search by stage code or title across all Global stages.'}</p>
      </div>
    </details>
    {notice && <p className={common.notice} role="status">{notice}</p>}
  </form>;
}
