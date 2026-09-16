import Head from 'next/head';
import Link from 'next/link';
import { ICONS } from '@/components/layout/Sitenav';
import { GAMES } from '@/lib/minigames/catalogue';
import styles from '@/styles/games/games.module.css';

export default function GamesPage() {
  return <>
    <Head>
      <title>Games — Arkpedia</title>
      <meta name="description" content="Play Arkpedia’s guessing games." />
    </Head>
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Games</h1>
        <p>Choose a game to get started.</p>
      </header>
      <ul className={styles.games} aria-label="Choose a game">
        {GAMES.map((game) => <li key={game.href}>
          <Link href={game.href} prefetch={false} className={styles.card} aria-labelledby={`game-${game.icon}`}>
            <span className={styles.icon} aria-hidden="true">{ICONS[game.icon]}</span>
            <div>
              <h2 id={`game-${game.icon}`}>{game.name}</h2>
              <p>{game.description}</p>
              <span className={styles.play}>Play</span>
            </div>
          </Link>
        </li>)}
      </ul>
    </main>
  </>;
}
