import { useMemo, useRef, useState } from 'react';
import { GameOperator, resolveOperator } from '@/lib/minigames/logic';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import { useKeyboardListNav } from '@/lib/hooks/useKeyboardListNav';
import styles from '@/styles/games/minigames.module.css';

export default function OperatorAnswer({ operators, onGuess }: { operators: GameOperator[]; onGuess: (name: string) => void }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => input.trim() ? operators.filter((op) =>
    matchesSearch(op.name, input.trim()) || op.aliases.some((alias) => matchesSearch(alias, input.trim()))
  ).sort((a, b) => searchRelevance(a.name, input.trim()) - searchRelevance(b.name, input.trim()) || a.name.localeCompare(b.name)).slice(0, 8) : [], [input, operators]);
  function choose(operator: GameOperator) {
    onGuess(operator.name); setInput(''); setOpen(false); setNotice('');
    if (window.matchMedia('(min-width: 801px)').matches) inputRef.current?.focus({ preventScroll: true });
  }
  const nav = useKeyboardListNav(suggestions, choose);
  const showList = open && suggestions.length > 0;
  return <form className={styles.answerForm} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onSubmit={(event) => {
    event.preventDefault();
    const operator = resolveOperator(input, operators);
    if (operator) choose(operator);
    else { setNotice('Choose an operator from the suggestions. No guess used.'); setOpen(true); }
  }}>
    <label htmlFor="minigame-answer">Operator name</label>
    <div className={styles.answerRow}>
      <div className={styles.search}>
        <input id="minigame-answer" ref={inputRef} className={styles.input} type="text" role="combobox"
          aria-autocomplete="list" aria-expanded={showList} aria-controls="minigame-suggestions"
          aria-activedescendant={showList && nav.highlightedIndex >= 0 ? `minigame-option-${nav.highlightedIndex}` : undefined}
          autoComplete="off" spellCheck={false} placeholder="Search an operator…" value={input}
          onFocus={() => setOpen(true)} onChange={(event) => { setInput(event.target.value); setOpen(true); setNotice(''); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); else if (open) nav.handleKeyDown(event); }} />
        {showList && <ul id="minigame-suggestions" className={styles.suggestions} role="listbox" aria-label="Operator suggestions">
          {suggestions.map((operator, i) => <li key={operator.name} role="presentation">
            <button type="button" role="option" id={`minigame-option-${i}`} aria-selected={nav.highlightedIndex === i}
              ref={nav.setItemRef(i)} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(operator)}>{operator.name}</button>
          </li>)}
        </ul>}
      </div>
      <button className={styles.primary} type="submit" disabled={!input.trim()}>Guess</button>
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </form>;
}
