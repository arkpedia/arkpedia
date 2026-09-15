import { GetServerSideProps } from 'next';

/**
 * The old Events list, now a view of the Schedule page.
 *
 * Calendar and Events were two pages behind one nav dropdown, and they are two readings
 * of the same thing: what is running and what is coming. They share a heading now and
 * a switcher chooses between them.
 *
 * This address stays, because links and bookmarks point at it, and redirects to the
 * Schedule page, whose default view IS the list. 308 rather than 302: the move is
 * permanent and a permanent redirect is what search engines should record. The event
 * DETAIL pages are untouched -- they are /events/[slug] and still where they were.
 */
export default function EventsIndexRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/schedule', permanent: true },
});
