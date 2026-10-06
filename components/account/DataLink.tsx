import Link from 'next/link';

/*
 * Where the reader's data comes in and goes out: Import / export lives on the Account page
 * only (components/account/DataDialog), and the pages that read it point there. Every page
 * reads the same browser storage, so a file or game import there shows up here on the next
 * visit.
 */
export default function DataLink() {
  return (
    <Link prefetch={false} href="/account" className="btn btn-sm ghost data-link">Import or back up your data →</Link>
  );
}
