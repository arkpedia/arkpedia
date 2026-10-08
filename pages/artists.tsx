import type { GetStaticProps } from 'next';
import CreditDatabase from '@/components/operators/CreditDatabase';
import { withContentPage } from '@/lib/content/server';
import { creditDatabase, type CreditPerson } from '@/lib/operators/creditDatabase';
export default function Page({ people }: { people: CreditPerson[] }) { return <CreditDatabase people={people} kind="artists" />; }
// This builder reads operator files. Until a content release publishes the route,
// retain the populated build snapshot instead of rebuilding without data/ during ISR.
export const getStaticProps: GetStaticProps = withContentPage('/artists', async () => ({ props: { people: creditDatabase('artists') } }));
