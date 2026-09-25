import { withContentPage } from '@/lib/content/server';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameLinks, { GamesEyebrow } from '@/components/minigames/GameLinks';
import PageHeader from '@/components/ui/PageHeader';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import OperatorAnswer from '@/components/minigames/OperatorAnswer';
import RoundFeedback from '@/components/minigames/RoundFeedback';
import { getRecruitmentGameData } from '@/lib/minigames/recruitmentData';
import { rarityFromIconPath } from '@/lib/operators/operatorIcon';
import { newProgress, pickNext, submitAnswer } from '@/lib/minigames/logic';
import type { RecruitmentGameOperator, RecruitmentQuestion } from '@/lib/minigames/recruitmentLogic';
import styles from '@/styles/games/minigames.module.css';

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
  /* Revealing swaps the answer field and feedback (taller) for one line of result, so
     a reader at the bottom of the round was clamped up 100-160px every reveal, then
     pushed back down by the next round. The floor holds the round's height through
     the reveal; a new question is a new logical page. */
  const roundFloor = useHeightFloor(question?.id ?? '');
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
    <PageHeader eyebrow={<GamesEyebrow />} title="Recruitment Guesser" sub="Name every operator a set of recruitment tags can give you." actions={<GameLinks />} />
    <main className={styles.page}>
      {!question ? <p className={styles.muted} role="status">{questions.length ? 'Preparing your first combination…' : 'No recruitment combinations available.'}</p> : <div ref={roundFloor.ref}><section className={`op-section ${styles.round}`} ref={roundRef} tabIndex={-1} aria-label="Recruitment challenge">
        <div className={styles.roundTop}><h2>{playing ? 'Name every possible operator' : progress.status === 'won' ? 'Every operator found' : 'The possible recruits'}</h2><span>Round {roundNumber} · {progress.found.length}/{question.answers.length} found</span></div>
        <details className={`${styles.disclosure} ${styles.rules}`}><summary>Which operators count?</summary><p>Only operators in the Global recruitment roster. Assume every displayed tag stays. There is no recruitment-time filter: Robots and Starters count too. Six-star operators require the Top Operator tag.</p><p>Correct answers stay found and don’t use a guess. You can make five wrong guesses. A combination with four or more possible answers is never used.</p></details>
        <div className={styles.tags} aria-label="Recruitment tags">{question.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <ul className={styles.results} aria-label="Matching operators">
          {shownAnswers.map((name) => {
            const operator = roster.get(name)!;
            /* From the icon's folder: the published props carry the icon, not the rarity. */
            const stars = rarityFromIconPath(operator.icon);
            const rarity = stars === null ? null : rarityLevel(stars);
            return <li key={name} className={styles.result} data-found={progress.found.includes(name)}><Image className={rarity ? `tier-${rarity}` : undefined} src={operator.icon} alt="" width={54} height={54} /><div><strong>{name}</strong><small>{rarity && <><Rarity n={rarity} /> · </>}{progress.found.includes(name) ? 'Found' : 'Not found'}</small></div></li>;
          })}
          {playing && Array.from({ length: question.answers.length - progress.found.length }, (_, i) => <li key={`empty-${i}`} className={`${styles.result} ${styles.emptySlot}`}>Operator still to find</li>)}
        </ul>
        {playing ? <>
          <OperatorAnswer key={roundNumber} operators={operators} onGuess={guess} />
          <RoundFeedback progress={progress} notice={notice} />
          <div className={styles.actions}><button type="button" className="ghost" onClick={() => { setProgress({ ...progress, status: 'revealed' }); setNotice('Answers revealed.'); }}>Reveal answers</button></div>
        </> : <>
          <p className={styles.muted} role="status">{progress.status === 'won' ? 'You named the full recruitment pool for these tags.' : progress.status === 'lost' ? 'No guesses left. These are all the matching operators.' : 'These are all the operators that match every displayed tag.'}</p>
          <div className={styles.actions}><button type="button" className="primary" onClick={startRound}>Next combination</button><Link href="/recruitment" prefetch={false} className="btn">Recruitment calculator</Link></div>
        </>}
      </section>{roundFloor.spacer}</div>}
    </main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/games/recruitment-guesser", async () => ({ props: getRecruitmentGameData() }));
