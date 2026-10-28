import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import CreditDatabase, { type CreditPageProps } from '@/components/operators/CreditDatabase';
import { withContentPage } from '@/lib/content/server';
import { creditDatabase, upgradeCreditProps } from '@/lib/operators/creditDatabase';
export default function Page(props: CreditPageProps) { return <><PageMeta title="Voice Actors" description="Arknights voice actors and the operators each one voices, in every language." path="/voice-actors" /><CreditDatabase {...props} kind="voice-actors" /></>; }
// This builder reads operator files. Until a content release publishes the route,
// retain the populated build snapshot instead of rebuilding without data/ during ISR.
// `now`, the CN-only filter's first paint, is the request's clock (contentPageClock).
export const getStaticProps: GetStaticProps<CreditPageProps> = withContentPage<CreditPageProps>('/voice-actors', async () => ({ props: creditDatabase('voice-actors') }),
  // A release from before the filters holds the old shape: upgrade it (upgradeCreditProps).
  { finalize: async props => ({ ...props, ...upgradeCreditProps(props) }) });
