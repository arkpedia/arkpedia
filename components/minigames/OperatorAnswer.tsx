import { useMemo, useRef, useState } from 'react';
import SearchInput from '@/components/ui/SearchInput';
import { GameOperator, resolveOperator } from '@/lib/minigames/logic';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import styles from '@/styles/games/minigames.module.css';

export default function OperatorAnswer({ operators, onGuess }: { operators: GameOperator[]; onGuess: (name: string) => void }) {
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /* On a phone the field sits low in the round and the keyboard covers anything
     drawn under it, so the list opens upward there. */
  const phone = useMediaQuery('(max-width: 480px)');
  const suggestions = useMemo(() => input.trim() ? operators.filter((op) =>
    matchesSearch(op.name, input.trim()) || op.aliases.some((alias) => matchesSearch(alias, input.trim()))
  ).sort((a, b) => searchRelevance(a.name, input.trim()) - searchRelevance(b.name, input.trim()) || a.name.localeCompare(b.name)).slice(0, 8) : [], [input, operators]);
  function choose(operator: GameOperator) {
    onGuess(operator.name); setInput(''); setNotice('');
    if (window.matchMedia('(min-width: 801px)').matches) inputRef.current?.focus({ preventScroll: true });
  }
  return <form className={styles.answerForm} onSubmit={(event) => {
    event.preventDefault();
    const operator = resolveOperator(input, operators);
    if (operator) choose(operator);
    else setNotice('Choose an operator from the suggestions. No guess used.');
  }}>
    <label htmlFor="minigame-answer">Operator name</label>
    <div className={styles.answerRow}>
      <SearchInput id="minigame-answer" inputRef={inputRef} label="Operator name" value={input}
        onChange={(value) => { setInput(value); setNotice(''); }} placeholder="Search an operator…"
        suggestions={suggestions} getKey={(operator) => operator.name} renderSuggestion={(operator) => operator.name}
        onPick={choose} suggestLabel="Operator suggestions" upward={phone} />
      <button className="primary" type="submit" disabled={!input.trim()}>Guess</button>
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </form>;
}
