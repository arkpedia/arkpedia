import type { ReactNode } from 'react';
import BackLink from './BackLink';
import StickyControls from './StickyControls';

interface PageHeaderProps {
  /** The mono teal line above the title: "Rhodes Island // Personnel Archive".
   *  Required, and specific to the section -- seven pages sharing one
   *  "Rhodes Island // Terminal" eyebrow is what made them read as one page. */
  eyebrow: ReactNode;
  /** The page's one h1. */
  title: ReactNode;
  /** A short lede under the title, in the site's .sub voice. */
  sub?: ReactNode;
  /** Page-wide controls -- search, filters, a primary action -- drawn under the
   *  title in the header's frame. Sticky actions follow the header so its short
   *  height cannot constrain their sticky range. */
  actions?: ReactNode;
  /** Long catalogues: keep compact search/filter controls reachable while scrolling. */
  stickyActions?: boolean;
  /** Less vertical air, for a tool whose first screen should be the tool. The
   *  title stays the same size: slim is spacing, not hierarchy. */
  slim?: boolean;
  /** Tool header with its actions beside the title, keeping the first viewport for content. */
  compact?: boolean;
  /** An id for the h1, when a landmark or a skip link names it. */
  titleId?: string;
  /** A detail page's Back, above the eyebrow: to the page before it in this tab, else to the
   *  list it belongs to (`href`, named by `label`). components/ui/BackLink.tsx. */
  back?: { href: string; label: string };
}

/**
 * The page header every page opens with: a mono teal eyebrow, the h1 in Rajdhani
 * 700 uppercase (30px, 24px at <=720), an optional lede and actions, and a --line-soft
 * hairline, all inside the 1320px frame with the --page-gutter.
 *
 * It emits exactly the markup the reference pages (/operators, /gacha) were written
 * with -- a bare <header>, a .eyebrow, an <h1> -- so the global rules in
 * styles/core/shared.css style it and a page moved onto it cannot drift.
 *
 * Render it as a SIBLING of <main>, never inside it: main has its own gutter, and a
 * header nested in it starts 24px to the right of the content below
 * (tests/browser/page-bounds.spec.ts measures that edge on every route).
 */
export default function PageHeader({ eyebrow, title, sub, actions, stickyActions = false, slim = false, compact = false, titleId, back }: PageHeaderProps) {
  return (
    <>
    <header className={`page-header${slim ? ' page-header-slim' : ''}${compact ? ' page-header-compact' : ''}${actions && stickyActions ? ' page-header-with-sticky-actions' : ''}`}>
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <div className="eyebrow">{eyebrow}</div>
      <h1 id={titleId}>{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
      {actions && !stickyActions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
    {actions && stickyActions ? <StickyControls className="page-header-sticky-actions"><div className="page-header-actions">{actions}</div></StickyControls> : null}
    </>
  );
}
