import type { GetStaticProps } from 'next';
import CreditDatabase from '@/components/operators/CreditDatabase';
import { withContentPage } from '@/lib/content/server';
import { creditDatabase, type CreditPerson } from '@/lib/operators/creditDatabase';
export default function Page({ people }: { people: CreditPerson[] }) { return <CreditDatabase people={people} kind="artists" />; }
export const getStaticProps: GetStaticProps = withContentPage('/artists', async () => ({ props: { people: creditDatabase('artists') } }), { bundledWhenUnpublished: true });
