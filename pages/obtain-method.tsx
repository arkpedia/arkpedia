import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { useMemo, useState } from 'react';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { operatorRelease } from '@/lib/operators/operatorAvailability';
import { RosterOperator } from '@/lib/operators/operatorTypes';
import { LIMITED_SUBTYPES, WELFARE_SUBTYPES, obtainMethodsOf, welfareMatches, welfareSourceOf } from '@/lib/operators/obtainMethods';
import { getLimitedBannerInfoLookup, getCelebrationBannerDates, LimitedBannerType, LimitedOperatorInfo } from '@/lib/gacha/limitedBannerType';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { portraitStatus } from '@/lib/operators/operatorPortrait';
import { limitedOperatorNote } from '@/lib/gacha/limitedRerunNotes';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { operatorHref } from '@/lib/operators/operatorHref';

interface Props {
  operators: RosterOperator[];
  limitedBannerInfo: Record<string, LimitedOperatorInfo>;
  celebrationBannerDates: string[];
  /** The request's clock (contentPageClock). Every day count renders from it, so the
   *  server HTML and hydration agree in any reader's timezone. */
  now: number;
}

type MainSection = 'limited' | 'standard' | 'kernel' | 'recruitment' | 'welfare';

const MAIN_SECTIONS: { key: MainSection; label: string }[] = [
  { key: 'limited', label: 'Limited Headhunting' },
  { key: 'standard', label: 'Standard Headhunting' },
  { key: 'kernel', label: 'Kernel Headhunting' },
  { key: 'recruitment', label: 'Pure Recruitment' },
  { key: 'welfare', label: 'Welfare' },
];

function OperatorCard({ op, note, index }: { op: RosterOperator; note?: string | null; index: number }) {
  return (
    <Link prefetch={false}
      href={operatorHref(op.name, null)}
      className="card roster-card roster-card-enter"
      style={{ animationDelay: `${Math.min(index * 25, 600)}ms` }}
    >
      <div className="avatar">
        <Image src={getOperatorIconPath(op)} alt={op.name} fill sizes="160px" />
      </div>
      <p className="op-name">{op.name}</p>
      {/* One flex item, not two: .roster-class-branch is a wrapping flex row, and with
          the rarity and the note as siblings the note wrapped onto a line of its own
          that began with the dash. Each dash is glued to the word before it with a
          no-break space, so however the note wraps no line starts with one
          (tests/browser/planning-pages.spec.ts). */}
      <p className="hint roster-class-branch">
        <span>
          {op.rarity ? <Rarity n={rarityLevel(op.rarity)} /> : null}
          {note ? `${op.rarity ? '\u00a0— ' : ''}${note.replace(/ — /g, '\u00a0— ')}` : ''}
        </span>
      </p>
    </Link>
  );
}

/** Shows every matching operator at once -- no pagination. */
function OperatorGrid({ operators, getNote }: { operators: RosterOperator[]; getNote?: (op: RosterOperator) => string | null }) {
  if (operators.length === 0) {
    return <p className="hint">No operators match this category.</p>;
  }

  return (
    <div className="grid roster-grid">
      {operators.map((op, i) => (
        <OperatorCard key={op.name} op={op} note={getNote ? getNote(op) : null} index={i} />
      ))}
    </div>
  );
}

function releaseDateValue(op: RosterOperator): number {
  return operatorRelease(op)?.at ?? -Infinity;
}

// Limited notes (days until an announced rerun, or an estimate of the next one) are
// worked out by lib/gacha/limitedRerunNotes.ts from `now`, in the server's calendar.

export default function ObtainMethodPage({ operators, limitedBannerInfo, celebrationBannerDates, now }: Props) {
  const [activeSection, setActiveSection] = useState<MainSection>('limited');
  const [limitedSubType, setLimitedSubType] = useState<LimitedBannerType | 'all'>('all');
  const [welfareSubType, setWelfareSubType] = useState<string>('all');

  const byCategory = useMemo(() => {
    const limited: RosterOperator[] = [];
    const standard: RosterOperator[] = [];
    const kernel: RosterOperator[] = [];
    const pureRecruitment: RosterOperator[] = [];
    const welfare: RosterOperator[] = [];

    const rarityFirst = [...operators].sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0));

    for (const op of rarityFirst) {
      const methods = obtainMethodsOf(op.howToObtain);
      if (methods.includes('limited')) limited.push(op);
      if (methods.includes('standard')) standard.push(op);
      if (methods.includes('kernel')) kernel.push(op);
      if (methods.includes('recruitment-only')) pureRecruitment.push(op);
      if (methods.includes('welfare')) welfare.push(op);
    }

    // Limited: release date, newest first -- reruns make recency the
    // relevant signal here, not rarity (they're a mix of 5-star and
    // 6-star anyway).
    limited.sort((a, b) => releaseDateValue(b) - releaseDateValue(a));

    // Standard/Kernel: rarity first, release date as the tiebreak.
    const rarityThenDate = (a: RosterOperator, b: RosterOperator) => {
      const r = (b.rarity ?? 0) - (a.rarity ?? 0);
      return r !== 0 ? r : releaseDateValue(b) - releaseDateValue(a);
    };
    standard.sort(rarityThenDate);
    kernel.sort(rarityThenDate);

    return { limited, standard, kernel, pureRecruitment, welfare };
  }, [operators]);

  const limitedList = useMemo(() => {
    if (limitedSubType === 'all') return byCategory.limited;
    return byCategory.limited.filter((op) => limitedBannerInfo[op.name]?.type === limitedSubType);
  }, [byCategory.limited, limitedSubType, limitedBannerInfo]);

  const welfareList = useMemo(() => {
    if (welfareSubType === 'all') return byCategory.welfare;
    return byCategory.welfare.filter((op) => welfareMatches(welfareSourceOf(op.howToObtain) ?? undefined, welfareSubType));
  }, [byCategory.welfare, welfareSubType]);

  return (
    <>
      <PageMeta title="Obtain Method" description="How each Arknights operator is obtained: headhunting, recruitment, events, the store or welfare." path="/obtain-method" />

      {/* Outside <main>, like every page header: nested inside it, the title started
          24px right of the grid it heads. The way back to the roster is the eyebrow's
          crumb rather than a separate button. */}
      <PageHeader
        eyebrow="Rhodes Island // Obtain method"
        title="Obtain Method"
        sub="Every operator, grouped by how they're actually obtained."
      />

      <main>
        <section className="op-section obtain-method">
          <SegmentedControl<MainSection>
            label="How they are obtained"
            className="obtain-filter-row"
            value={activeSection}
            onChange={setActiveSection}
            options={MAIN_SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
          />

          {activeSection === 'limited' && (
            <>
              <SegmentedControl<LimitedBannerType | 'all'>
                label="Limited banner type"
                className="obtain-filter-row obtain-subfilter-row"
                value={limitedSubType}
                onChange={setLimitedSubType}
                options={[{ value: 'all', label: 'All' }, ...LIMITED_SUBTYPES.map((t) => ({ value: t, label: t }))]}
              />
              <OperatorGrid
                operators={limitedList}
                getNote={(op) => limitedOperatorNote(op, limitedBannerInfo[op.name], celebrationBannerDates, now)}
              />
            </>
          )}

          {activeSection === 'standard' && <OperatorGrid operators={byCategory.standard} />}

          {activeSection === 'kernel' && <OperatorGrid operators={byCategory.kernel} />}

          {activeSection === 'recruitment' && <OperatorGrid operators={byCategory.pureRecruitment} />}

          {activeSection === 'welfare' && (
            <>
              <SegmentedControl<string>
                label="Welfare source"
                className="obtain-filter-row obtain-subfilter-row"
                value={welfareSubType}
                onChange={setWelfareSubType}
                options={[{ value: 'all', label: 'All' }, ...WELFARE_SUBTYPES.map((w) => ({ value: w.label, label: w.label }))]}
              />
              <OperatorGrid
                operators={welfareList}
                getNote={(op) => welfareSourceOf(op.howToObtain)?.note ?? null}
              />
            </>
          )}
        </section>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/obtain-method", async () => {
  const operators: RosterOperator[] = getAllOperators().map((op) => ({
    name: op.name,
    rarity: op.rarity,
    class: op.class,
    branch: op.branch,
    faction: op.faction,
    howToObtain: op.howToObtain,
    isFuture: op.isFuture ?? false,
    ...portraitStatus(op),
    ...(op.releaseAt ? { releaseAt: op.releaseAt } : {}),
    // Only 'Release Date' is actually read anywhere on this page --
    // the full characterInfo object (description, position, tags,
    // etc.) is a large chunk of unused payload otherwise.
    characterInfo: op.characterInfo?.['Release Date'] ? { 'Release Date': op.characterInfo['Release Date'] } : null,
  }));
  const banners = getAllHeadhuntingBanners();
  const limitedBannerInfo = getLimitedBannerInfoLookup(banners);
  const celebrationBannerDates = getCelebrationBannerDates(banners);
  return { props: { operators, limitedBannerInfo, celebrationBannerDates } };
});
