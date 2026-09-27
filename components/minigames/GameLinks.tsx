import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAMES } from '@/lib/minigames/catalogue';
import styles from './GameLinks.module.css';

/** Every game's eyebrow: the section, with a crumb back to the hub. */
export function GamesEyebrow() {
  return <>Rhodes Island // <Link href="/games" prefetch={false}>Games</Link></>;
}

/** The switcher between games, drawn in the page header's actions: the site's tab look
 *  (.tabs / .tab, arkpedia-theme.css) on one link per game, the one being played
 *  marked current. It is navigation, so links with aria-current="page" (which the tab's
 *  current state reads) rather than role="tab". On a phone it is two rows that do not
 *  depend on the font drawing them (GameLinks.module.css). */
export default function GameLinks() {
  const { pathname } = useRouter();
  return (
    <nav className={`tabs ${styles.links}`} aria-label="Games">
      {GAMES.map(({ href, shortName }) => {
        return (
          <Link key={href} href={href} prefetch={false} className="tab" aria-current={pathname === href ? 'page' : undefined}>
            {shortName}
          </Link>
        );
      })}
    </nav>
  );
}
