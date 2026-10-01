import { useRef, useState } from 'react';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import GameSignIn from '@/components/account-import/GameSignIn';
import { SERVERS } from '@/lib/account-import/yostar';

/*
 * Account import (issue #94): sign in with the Yostar email code and read the account,
 * entirely from this page (components/account-import, lib/account-import), then summarize
 * it and offer it as a file. The planner's Import / Export dialog runs the same sign-in and
 * fills its roster and depot from it. Unlisted while it is tried on the dev site.
 */

interface Summary {
  name: string;
  level: number | null;
  operators: number;
  elite2: number;
  items: number;
}

function summarize(user: Record<string, any>): Summary {
  const status = user.status ?? {};
  const chars = Object.values(user.troop?.chars ?? {}) as { evolvePhase?: number }[];
  return {
    name: status.nickName ? `${status.nickName}#${status.nickNumber ?? ''}` : 'Doctor',
    level: typeof status.level === 'number' ? status.level : null,
    operators: chars.length,
    elite2: chars.filter((char) => char.evolvePhase === 2).length,
    items: Object.values(user.inventory ?? {}).filter((count) => typeof count === 'number' && count > 0).length,
  };
}

export default function ImportPage() {
  const server = 'en' as const;
  const [summary, setSummary] = useState<Summary | null>(null);
  // The account itself, for the download only. Never stored anywhere else.
  const account = useRef<Record<string, any> | null>(null);

  function download() {
    if (!account.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(account.current, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `arknights-account-${summary?.name.replace(/[^\w-]+/g, '_') ?? 'doctor'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Head>
        <title>Account import — Arkpedia</title>
        <meta name="robots" content="noindex" />
      </Head>

      <PageHeader
        eyebrow="Rhodes Island // Account import"
        title="Account import"
        sub="Read your Arknights account into Arkpedia: operators, levels and inventory."
      />

      <main>
        <section className="op-section">
          <h2>How it works</h2>
          <p className="import-copy">
            You sign in with your Yostar email, as the game does. Your email, the code and the game&apos;s tokens go
            from this page to Yostar and the game&apos;s servers, encrypted end to end. The requests a browser cannot
            send by itself pass through <code>relay.arkpedia.net</code> as encrypted traffic it cannot read. Nothing
            is stored, not in this browser and not on our servers.
          </p>
          <p className="hint import-note">
            This is a sign-in like the game&apos;s own: if the game is open on your phone, it goes back to the
            title screen, and starting it again signs you straight back in, with no new code.
            Server: {SERVERS[server].label}. The planner imports the same way, under Export / import.
          </p>

          <GameSignIn server={server} onAccount={(user) => { account.current = user; setSummary(summarize(user)); }} />
        </section>

        {summary && (
          <section className="op-section">
            <h2>Your account</h2>
            <dl className="import-summary">
              <div><dt>Doctor</dt><dd>{summary.name}</dd></div>
              <div><dt>Level</dt><dd>{summary.level ?? '—'}</dd></div>
              <div><dt>Operators</dt><dd>{summary.operators}</dd></div>
              <div><dt>Elite 2</dt><dd>{summary.elite2}</dd></div>
              <div><dt>Item kinds</dt><dd>{summary.items}</dd></div>
            </dl>
            <button type="button" className="btn-sm" onClick={download}>Download the account as JSON</button>
            <p className="hint">The download is made in this browser from what the game sent. Reload the page to forget it.</p>
          </section>
        )}
      </main>
    </>
  );
}
