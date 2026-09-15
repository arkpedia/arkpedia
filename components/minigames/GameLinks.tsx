import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAMES } from '@/lib/minigames/catalogue';
import styles from '@/styles/game-links.module.css';

export default function GameLinks() {
  const { pathname } = useRouter();
  return <>
    <Link className={styles.allGames} href="/games" prefetch={false}>All games</Link>
    <nav className={styles.gameLinks} aria-label="Minigames">
      {GAMES.map(({ href, shortName }) => <Link key={href} href={href} prefetch={false} aria-current={pathname === href ? 'page' : undefined}>{shortName}</Link>)}
    </nav>
  </>;
}
