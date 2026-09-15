import { useMemo, useRef, useState } from 'react';
import { useKeyboardListNav } from '@/lib/hooks/useKeyboardListNav';
import { resolveStageAnswer, searchStageAnswers, StageAnswer as Answer, StageSearchMode } from '@/lib/minigames/stageGuesser';
import common from '@/styles/minigames.module.css';
import styles from '@/styles/stage-guesser.module.css';

export default function StageAnswer({ stages, onGuess, mode, onModeChange, onTypingChange }: { stages: Answer[]; onGuess: (slug: string) => void; mode: StageSearchMode; onTypingChange: (typing: boolean) => void; onModeChange: (mode: StageSearchMode) => void }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => searchStageAnswers(input, stages, mode), [input, stages, mode]);
  function choose(stage: Answer) {
    onGuess(stage.slug); setInput(''); setOpen(false); setNotice('');
    inputRef.current?.focus({ preventScroll: true });
  }
  const nav = useKeyboardListNav(suggestions, choose);
  const showList = open && suggestions.length > 0;
  return <form className={`${common.answerForm} ${styles.answerForm}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onSubmit={(event) => {
    event.preventDefault();
    const stage = resolveStageAnswer(input, stages);
    if (stage) choose(stage);
    else { setNotice('Choose a stage from the suggestions. No guess used.'); setOpen(true); }
  }}>
    <label htmlFor="stage-answer">{mode === 'connections' ? 'Stage, event or chapter' : 'Stage code or name'}</label>
    <div className={`${common.search} ${styles.search}`}>
      <input id="stage-answer" ref={inputRef} className={common.input} type="text" role="combobox" value={input}
        autoComplete="off" spellCheck={false} placeholder={mode === 'connections' ? 'Stage, Under Tides, chapter 8…' : 'Type a code or stage title…'} enterKeyHint="go" aria-autocomplete="list"
        aria-expanded={showList} aria-controls={showList ? 'stage-suggestions' : undefined}
        aria-activedescendant={showList && nav.highlightedIndex >= 0 ? `stage-option-${nav.highlightedIndex}` : undefined}
        onFocus={() => { setOpen(true); onTypingChange(true); }} onChange={(event) => { setInput(event.target.value); setOpen(true); setNotice(''); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); nav.setHighlightedIndex(-1); } else if (open) nav.handleKeyDown(event); }} />
      {showList && <ul id="stage-suggestions" className={`${common.suggestions} ${styles.suggestions}`} role="listbox" aria-label="Stage suggestions">
        {suggestions.map((stage, index) => <li key={stage.slug} role="presentation"><button type="button" role="option"
          id={`stage-option-${index}`} aria-selected={nav.highlightedIndex === index} ref={nav.setItemRef(index)} tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(stage)}><strong>{stage.code}</strong><span>{stage.name}</span>{mode === 'connections' && <small>{stage.source}</small>}</button></li>)}
      </ul>}
    </div>
    <button className={common.primary} type="submit" disabled={!input.trim()}>Guess stage</button>
    <details className={styles.searchSettings}><summary>Search settings</summary>    <fieldset className={styles.searchModes}>
      <legend>Answer search</legend>
      <label><input type="radio" name="stage-search-mode" checked={mode === 'stages'} onChange={() => { onModeChange('stages'); setNotice(''); }} />Stage codes &amp; titles</label>
      <label><input type="radio" name="stage-search-mode" checked={mode === 'connections'} onChange={() => { onModeChange('connections'); setNotice(''); }} />Include events &amp; chapters</label>
    </fieldset>
    <p className={styles.searchHelp} id="stage-search-help">{mode === 'connections' ? 'Try “Under Tides” or “chapter 8”, then choose a stage. Searches all Global stages.' : 'Search by stage code or title across all Global stages.'}</p>
</details>
    {input.trim() && !suggestions.length && <p className={common.notice} role="status">No stages match this search.</p>}
    {notice && <p className={common.notice} role="status">{notice}</p>}
  </form>;
}
