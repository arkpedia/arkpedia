import Head from 'next/head';
import Link from 'next/link';
import { useMemo } from 'react';
import { withContentPage } from '@/lib/content/server';
import PageHeader from '@/components/ui/PageHeader';
import Image from '@/components/content/ContentImage';
import { RewardClick, RewardDetailsProvider } from '@/components/events/RewardDetails';
import { useAccount } from '@/lib/account/accountStore';
import type { buildSelectorCatalogue } from '@/lib/selectors/catalogue';
import { recommendation, ratingPoints } from '@/lib/selectors/scoring';
import SelectorPersonalization, { useSelectorPreferences } from '@/components/selectors/SelectorPersonalization';

type Props = ReturnType<typeof buildSelectorCatalogue>;
export default function SelectorTickets({ cards, tickets, candidates }: Props) {
  const account = useAccount();
  const [preferences, setPreferences] = useSelectorPreferences(account?.server ?? null);
  const scores = useMemo(() => Object.fromEntries(candidates.map(op => [op.name, recommendation(op, candidates, account?.operators ?? null, preferences)])), [candidates, account, preferences]);
  const missingRatings = candidates.some(op => Object.values(tickets).some(ticket => ticket.operators.some(candidate => candidate.name === op.name)) && ratingPoints(op.kukkikaze) === null && ratingPoints(op.community) === null);
  const customized = preferences.subSkills || ['arts', 'trueDamage', 'gameDestroyer', 'reveal'].some(key => preferences[key as keyof typeof preferences] !== null);
  const note = `${customized ? 'Scores use your personalization settings.' : account ? 'Scores include your imported roster bonuses.' : 'Base scores only. Import your account to apply roster bonuses.'}${missingRatings ? ' Operators without either rating show an available subtotal; the breakdown identifies missing data.' : ''}`;
  return <>
    <Head><title>Selector Tickets — Arkpedia</title></Head>
    <PageHeader eyebrow="Rhodes Island // Guides" title="Selector Tickets" sub="Compare the current 6★ selectors for your roster." />
    <main>
      <p className="selector-account">{account ? `Using ${account.doctor ?? 'your imported account'} · ${account.server}` : 'Import your account for personalized recommendations.'} <Link href="/account">{account ? 'Manage account' : 'Import account'}</Link></p>
      {missingRatings && <p className="hint" role="status">Some operators have neither rating. Those operators show available subtotals.</p>}
      <RewardDetailsProvider tickets={tickets} recommendations={scores} recommendationNote={note} recommendationSettings={<SelectorPersonalization candidates={candidates} ownedNames={account?.operators ?? null} preferences={preferences} onChange={setPreferences} />}>
        <div className="selector-cards">{cards.map(card => <RewardClick key={card.name} name={card.name} className="selector-card">
          <span className="selector-card-art">{card.imagePath && <Image src={card.imagePath} alt="" width={180} height={140} />}</span>
          <strong>{card.label}</strong><span>{card.name}</span><span className="hint">{card.pack ?? 'To Look Back on Terra · 3-day login gift'}</span>
          <span className="selector-card-action">View operators</span>
        </RewardClick>)}</div>
      </RewardDetailsProvider>
      <details className="selector-rules">
        <summary>How the score works</summary>
        <p>Kukkikaze and community ratings each contribute −1.25 at 5.8, increasing by +0.25 per 0.1 rating: 6.3 gives 0, 6.7 gives +1, 7.1 gives +2 and 7.2 gives +2.25. Community averages round to one decimal, as on Power Scale. If only one rating is available, its points double.</p>
        <p>Each main priority skill adds +0.5. Sub priority skills add 0 by default, or +0.1 each when enabled in Personalize recommendations. A skill with several mastery recommendations counts once, using its highest priority. IS and RA modules add +0.5 each.</p>
        <p>Coverage bonuses add +0.5 for Arts dealers, +0.5 for True damage dealers, +1 for a super-meta operator, and +0.25 for talent-based invisibility reveal. Account defaults use three or fewer owned 6★ Casters / Supporters for Arts, and no owned 6★ dealer for True damage. Owning a super-meta operator or a talent-based reveal operator turns off its coverage bonus. Super-meta includes Kukkikaze 7.0+ operators plus Ines, Ela, Lemuen, Eyjafjalla the Hvít Aska, Ascalon, Lappland the Decadenza, Logos, Yu, Ulpianus, Exusiai the New Covenant, Wiš'adel and Tragodia. Without an account, talent reveal adds +0.25 and the other coverage bonuses start off. Personalize recommendations lets you choose Yes / No manually. Damage types include skills, talents and summons; reveal excludes skills and module upgrades.</p>
        <p>Operators are sorted by score, highest first; equal scores are alphabetical. Red: below 0. Yellow: 0 to under 5. Green: 5 or higher. Owned operators keep their score and show an Owned label. Hover or focus a portrait for its score breakdown; click it for the operator preview.</p>
      </details>
    </main>
  </>;
}
export const getStaticProps = withContentPage<Props>('/selector-tickets', async () => ({
  props: process.env.ARKPEDIA_EXPORT_CONTENT === '1'
    ? (await import('@/lib/selectors/catalogue')).buildSelectorCatalogue()
    : (await import('@/data/selector-catalogue.json')).default as Props,
}), {
  bundledWhenUnpublished: true,
  // The previous content release predates these fields. Fill only missing flags
  // from the bundled projection until the next release supplies them itself.
  finalize: async props => {
    if (props.candidates.every(op => typeof op.supporter === 'boolean' && typeof op.talentReveal === 'boolean')) return props;
    const snapshot = (await import('@/data/selector-catalogue.json')).default;
    const flags = new Map(snapshot.candidates.map(op => [op.id, op]));
    return { ...props, candidates: props.candidates.map(op => ({ ...op,
      supporter: op.supporter ?? flags.get(op.id)?.supporter ?? false,
      talentReveal: op.talentReveal ?? flags.get(op.id)?.talentReveal ?? false,
    })) };
  },
});
