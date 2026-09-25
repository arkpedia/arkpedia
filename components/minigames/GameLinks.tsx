import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAMES } from '@/lib/minigames/catalogue';
import styles from '@/styles/games/game-links.module.css';

/** Every game's eyebrow: the section, with a crumb back to the hub. */
export function GamesEyebrow() {
  return <>Rhodes Island // <Link href="/games" prefetch={false}>Games</Link></>;
}

/** The switcher between games, drawn in the page header's actions: one .filter-chip
 *  link per game, the one being played marked current. It is navigation, so links
 *  with aria-current (which the chip's picked state reads) rather than pressed buttons. */
export default function GameLinks() {
  const { pathname } = useRouter();
  return (
    <nav className={`seg-control ${styles.gameLinks}`} aria-label="Games">
      {GAMES.map(({ href, shortName }) => {
        return (
          <Link key={href} href={href} prefetch={false} className="filter-chip" aria-current={pathname === href ? 'page' : undefined}>
            {shortName}
          </Link>
        );
      })}
    </nav>
  );
}
