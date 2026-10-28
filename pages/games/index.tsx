import Link from 'next/link';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import { ICONS } from '@/components/layout/Sitenav';
import { GAMES } from '@/lib/minigames/catalogue';
import styles from '@/styles/games/games.module.css';

export default function GamesPage() {
  return <>
    <PageMeta title="Games" description="Play Arkpedia’s guessing games." path="/games" />
    <PageHeader eyebrow="Rhodes Island // Games" title="Games" sub="Choose a game to get started." />
    <main>
      <ul className={styles.games} aria-label="Choose a game">
        {GAMES.map((game) => <li key={game.href}>
          <Link href={game.href} prefetch={false} className={`${styles.card} lift`} aria-labelledby={`game-${game.icon}`}>
            <span className={styles.icon} aria-hidden="true">{ICONS[game.icon]}</span>
            <div>
              <h2 id={`game-${game.icon}`} className="entity-title">{game.name}</h2>
              <p>{game.description}</p>
              <span className={styles.play}>Play <span aria-hidden="true">→</span></span>
            </div>
          </Link>
        </li>)}
      </ul>
    </main>
  </>;
}
