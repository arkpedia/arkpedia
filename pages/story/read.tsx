import { useEffect, useState } from 'react';
import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect from '@/components/ui/StyledSelect';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { withContentPage } from '@/lib/content/server';
import { nativeStoryData } from '@/lib/story/nativeStoryData';
import { nativeScriptUrl, parseNativeStory, type NativeStories, type StoryLine } from '@/lib/story/nativeStory';
import { setStoryPart, readStoryProgress, writeStoryProgress, useStoryProgress } from '@/lib/story/storyProgress';
import styles from '@/components/story/StoryReader.module.css';

interface Props { chapters: NativeStories }
export default function StoryReader({ chapters }: Props) {
  const router = useRouter();
  const key = typeof router.query.chapter === 'string' ? router.query.chapter : '';
  const chapter = Object.hasOwn(chapters, key) ? chapters[key] : undefined;
  const position = typeof router.query.part === 'string' ? chapter?.sections.findIndex(section => String(section.index) === router.query.part) ?? -1 : 0;
  const selected = position < 0 ? undefined : chapter?.sections[position];
  const [loaded, setLoaded] = useState<{ url: string; lines: StoryLine[] }>({url:'',lines:[]});
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(0);
  const progress = useStoryProgress();
  const url = selected && chapter ? nativeScriptUrl(chapter.revision, selected.path) : '';
  const loading = !!url && loaded.url !== url && !error;
  useEffect(() => {
    setError('');
    if (!url) return;
    const controller = new AbortController();
    void fetchAsset(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(async response => {
      if (!response.ok) throw Error('The story could not load.');
      const lines = parseNativeStory(await response.text());
      if (!lines.length) throw Error('This script has no readable text.');
      if (!controller.signal.aborted) setLoaded({url,lines});
    }).catch(reason => {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The story could not load.');});
    return () => controller.abort();
  }, [url, attempt]);
  const choose = (index: number) => {
    const section = chapter?.sections[index];
    if (section) void router.push({ pathname: '/story/read', query: {chapter:key,part:section.index} }, undefined, {shallow:true});
  };
  const read = !!selected && !!progress[`native_${key}`]?.includes(selected.index);
  return <>
    <PageMeta title={chapter ? `${chapter.title} · Story reader` : 'Story reader'} description="Read released event stories from the English game scripts." path="/story/read" noindex />
    <PageHeader className={styles.reader} eyebrow="Arknights // Story" title={chapter?.title ?? 'Story reader'} sub="English game text. Choices and their alternate dialogue are shown in reading order." />
    <main className={styles.reader}>
      <Link className="ghost btn-sm" href={{pathname:'/story',query:{view:'list',q:chapter?.title??''}}}>← Story library</Link>
      {!chapter || !selected ? <div className="waiting-box"><h2>Choose a story from the library</h2><p>This chapter or section is unavailable in this content release.</p></div> : <>
        <div className={styles.controls}>
          <button className="ghost btn-sm" disabled={position === 0} onClick={() => choose(position - 1)}>Previous</button>
          <StyledSelect label="Story section" value={String(selected.index)} onChange={value => choose(chapter.sections.findIndex(section => String(section.index) === value))} options={chapter.sections.map(section => ({value:String(section.index),label:[section.code,section.title,section.tag==='before'?'Before':section.tag==='after'?'After':''].filter(Boolean).join(' · ')}))} />
          <button className="ghost btn-sm" disabled={position === chapter.sections.length-1} onClick={() => choose(position + 1)}>Next</button>
        </div>
        <h2>{[selected.code,selected.title].filter(Boolean).join(' · ')}</h2>
        {loading && <p role="status">Loading story…</p>}
        {error && <p role="alert">{error} <button className="ghost btn-sm" onClick={() => setAttempt(value=>value+1)}>Retry</button></p>}
        {loaded.url === url && !error && <article aria-label="Story text">{loaded.lines.map((line,index) => <p className={styles.line} key={index}>{line.speaker && <strong className={styles.speaker}>{line.speaker}</strong>}{line.kind === 'choice' ? <em>{line.text}</em> : line.text}</p>)}</article>}
        <div className={styles.controls}>
          <button type="button" className="ghost btn-sm" aria-pressed={read} disabled={loading || !!error} onClick={() => {
            try {setNote('');writeStoryProgress(setStoryPart(readStoryProgress(localStorage),`native_${key}`,selected.index,!read));}
            catch {setNote('This browser could not save your reading progress.');}
          }}>{read?'Mark unread':'Mark as read'}</button>
          {position < chapter.sections.length-1 && <button className="primary btn-sm" onClick={() => choose(position + 1)}>Next section</button>}
          <a href={url} target="_blank" rel="noopener noreferrer">Game script source ↗</a>
        </div>
        {note && <p role="status">{note}</p>}
      </>}
    </main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/story/read', async () => ({props:{chapters:nativeStoryData()}}), {bundledWhenUnpublished:true});
