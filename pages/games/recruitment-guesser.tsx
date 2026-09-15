import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameLinks from '@/components/minigames/GameLinks';
import OperatorAnswer from '@/components/minigames/OperatorAnswer';
import RoundFeedback from '@/components/minigames/RoundFeedback';
import { getRecruitmentGameData } from '@/lib/minigames/recruitmentData';
import { newProgress, pickNext, submitAnswer } from '@/lib/minigames/logic';
import type { RecruitmentGameOperator, RecruitmentQuestion } from '@/lib/minigames/recruitmentLogic';
import styles from '@/styles/minigames.module.css';

interface Props { operators: RecruitmentGameOperator[]; questions: RecruitmentQuestion[] }
export default function RecruitmentGame({ operators, questions }: Props) {
  const [question, setQuestion] = useState<RecruitmentQuestion | null>(null);
  const [progress, setProgress] = useState(newProgress);
  const [notice, setNotice] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [roundNumber, setRoundNumber] = useState(0);
  const roundRef = useRef<HTMLElement>(null);
  const started = useRef(false);
  const roster = useMemo(() => new Map(operators.map((operator) => [operator.name, operator])), [operators]);
  const playing = progress.status === 'playing';
  useEffect(() => {
    if (roundNumber < 2) return;
    roundRef.current?.focus({ preventScroll: true });
  }, [roundNumber]);
  const startRound = useCallback(() => {
    const next = pickNext(questions, recent, (entry) => entry.id);
    if (!next) return;
    setQuestion(next); setProgress(newProgress()); setNotice('');
    setRecent((current) => [...current, next.id].slice(-30));
    setRoundNumber((current) => current + 1);
  }, [questions, recent]);
  useEffect(() => {
    if (started.current || !questions.length) return;
    started.current = true;
    startRound();
  }, [questions.length, startRound]);
  function guess(name: string) {
    if (!question) return;
    const next = submitAnswer(progress, name, question.answers);
    setProgress(next);
    setNotice(next === progress ? 'You already tried that operator. No guess used.' : next.status === 'won' ? 'Every operator found!' : next.found.includes(name) ? `${name} is a match. Keep going!` : `${name} doesn’t match all these tags.`);
  }
  const shownAnswers = question ? playing ? progress.found : question.answers : [];
  return <>
    <Head><title>Recruitment Guesser — Arkpedia</title><meta name="description" content="Name every recruitable Arknights operator matching a pair or triplet of tags. Every challenge has at most three answers." /></Head>
    <main className={styles.page}>
      <header className={styles.header}><div><h1>Recruitment Guesser</h1></div></header>
      <GameLinks />
      {!question ? <p className={styles.muted} role="status">{questions.length ? 'Preparing your first combination…' : 'No recruitment combinations available.'}</p> : <section className={styles.round} ref={roundRef} tabIndex={-1} aria-label="Recruitment challenge">
        <div className={styles.roundTop}><h2>{playing ? 'Name every possible operator' : progress.status === 'won' ? 'Every operator found' : 'The possible recruits'}</h2><span>Round {roundNumber} · {progress.found.length}/{question.answers.length} found</span></div>
        <details className={styles.rules}><summary>Which operators count?</summary><p>Only operators in the Global recruitment roster. Assume every displayed tag stays. There is no recruitment-time filter: Robots and Starters count too. Six-star operators require the Top Operator tag.</p><p>Correct answers stay found and don’t use a guess. You can make five wrong guesses. A combination with four or more possible answers is never used.</p></details>
        <div className={styles.tags} aria-label="Recruitment tags">{question.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <ul className={styles.results} aria-label="Matching operators">
          {shownAnswers.map((name) => {
            const operator = roster.get(name)!;
            return <li key={name} className={styles.result} data-found={progress.found.includes(name)}><Image src={operator.icon} alt="" width={54} height={54} /><div><strong>{name}</strong><small>{progress.found.includes(name) ? 'Found' : 'Not found'}</small></div></li>;
          })}
          {playing && Array.from({ length: question.answers.length - progress.found.length }, (_, i) => <li key={`empty-${i}`} className={`${styles.result} ${styles.emptySlot}`}>Operator still to find</li>)}
        </ul>
        {playing ? <>
          <OperatorAnswer key={roundNumber} operators={operators} onGuess={guess} />
          <RoundFeedback progress={progress} notice={notice} />
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => { setProgress({ ...progress, status: 'revealed' }); setNotice('Answers revealed.'); }}>Reveal answers</button></div>
        </> : <>
          <p className={styles.muted} role="status">{progress.status === 'won' ? 'You named the full recruitment pool for these tags.' : progress.status === 'lost' ? 'No guesses left. These are all the matching operators.' : 'These are all the operators that match every displayed tag.'}</p>
          <div className={styles.actions}><button type="button" className={styles.primary} onClick={startRound}>Next combination</button><Link href="/recruitment" prefetch={false}>Recruitment calculator</Link></div>
        </>}
      </section>}
    </main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = async () => ({ props: getRecruitmentGameData() });
