import { Fragment, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { highlightStats } from '@/components/ui/HighlightedText';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import type { BaseSkillKeyword } from '@/lib/operators/operatorTypes';

/**
 * A base skill's description with the game's keywords explained: each keyword the game underlines
 * (Closure's Special Order, Worldly Plight, a faction such as Lungmen Guard Department) is
 * underlined here too and opens the game's own definition on hover, keyboard focus or a tap
 * (scripts/imports/import-base-skills.mjs baseSkillKeywords). Numbers keep their highlight.
 */
export default function BaseSkillText({ text, keywords }: { text: string | null | undefined; keywords: readonly BaseSkillKeyword[] | undefined }) {
  if (!text) return null;
  if (!keywords?.length) return <>{highlightStats(text)}</>;
  // Longest first, so a keyword that holds a shorter one is matched whole.
  const ordered = [...keywords].sort((a, b) => b.text.length - a.text.length);
  const escaped = ordered.map(keyword => keyword.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`));
  const used = new Set<string>();
  const nodes: ReactNode[] = parts.map((part, index) => {
    const keyword = index % 2 === 1 ? ordered.find(entry => entry.text === part) : undefined;
    // The first mention carries the explanation; a repeat reads as plain words.
    if (keyword && !used.has(keyword.term)) {
      used.add(keyword.term);
      return <KeywordTip key={index} keyword={keyword} />;
    }
    return <Fragment key={index}>{highlightStats(part)}</Fragment>;
  });
  return <>{nodes}</>;
}

function KeywordTip({ keyword }: { keyword: BaseSkillKeyword }) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(300);
  const id = useId();
  const lines = keyword.definition.split('\n').filter(Boolean);
  return <>
    <button ref={buttonRef} type="button" className="btn-bare base-skill-keyword" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-describedby={open ? id : undefined}
      // A tap focuses the button and then clicks it: both open, so the click never shuts what the
      // focus just opened. A tap outside, Escape or leaving the button closes it.
      onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={close}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') close(); }}>
      {keyword.text}
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <div id={id} ref={menuRef} role="tooltip" className="base-skill-keyword-tip" style={menuStyle}>
        <b>{keyword.name}</b>
        {lines.map((line, index) => <p key={index}>{line}</p>)}
      </div>, document.body)}
  </>;
}
