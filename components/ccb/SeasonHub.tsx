import { ContentImg } from '@/components/content/ContentImage';
import { CcbArea, CcbGlyph, CcbSeasonBanner } from './art';
import { maximumRisk } from '@/lib/ccb/modifiers';
import type { BattleplanData } from '@/lib/ccb/types';
import { CCB_TEXT as T } from './strings';
import styles from './Battleplan.module.css';

type Season = BattleplanData['seasons'][number];
type Map = Season['maps'][number];
const stageArt = (map: Map) => map.pic && map.logo ? { pic: map.pic, logo: map.logo } : null;
/** Seasons whose wide banner is already in the content release; later ones use the game's own shop banner. */
const PUBLISHED_SEASON_ART = 4;
const maxRisk = (map: Map) => maximumRisk(map.groups);

/** The season screen, flattened: every season and every battlefield is one press away. */
export default function SeasonHub({ seasons, season, map, onSeason, onMap }: { seasons: Season[]; season: Season; map: Map; onSeason: (id: string) => void; onMap: (id: string) => void }) {
  const main = season.maps.find(row => row.main) ?? season.maps[0];
  const mainArt = stageArt(main);
  return <section className={styles.hub} aria-label={T.title}>
    <div className={styles.hubSeasons} role="group" aria-label={T.seasons}>
      {seasons.map(row => <button type="button" key={row.id} className={`btn-bare ${styles.seasonTile}`} aria-pressed={row.id === season.id} onClick={() => onSeason(row.id)}>
        {row.number <= PUBLISHED_SEASON_ART ? <ContentImg src={`/content-art/${row.id}.webp`} alt="" width={160} height={90} /> : <CcbSeasonBanner id={row.id} />}
        <span><span className={styles.kicker}>{T.seasonLabel(row.number)}</span><strong>{row.name.replace(/^Battleplan /, '')}</strong></span>
      </button>)}
    </div>
    <button type="button" className={`btn-bare ${styles.hubMain}`} aria-pressed={main.id === map.id} onClick={() => onMap(main.id)}>
      {mainArt ? <CcbArea id={mainArt.pic} className={styles.hubArt} /> : main.details?.preview && <ContentImg src={main.details.preview} alt="" className={styles.hubArt} />}
      <span className={styles.hubMainBand}>
        <span className={styles.hubPlace}><span className={styles.kicker}>{T.permanent} · {main.area}</span><strong>{main.name}</strong>{main.name !== main.originalName && <span lang="zh-CN" className={styles.mapOriginal}>{main.originalName}</span>}</span>
        {mainArt && <span className={styles.hex}><CcbGlyph kind="stagelogo" id={mainArt.logo} className={styles.hexLogo} /></span>}
      </span>
      <span className={styles.hubRisk}><span className={styles.kicker}>{T.maxRisk}</span><b>{maxRisk(main)}</b></span>
    </button>
    <div className={styles.hubRotating} role="group" aria-label={T.rotating}>
      <span className={styles.kicker}>{T.rotating}</span>
      {season.maps.filter(row => !row.main).map(row => {
        const a = stageArt(row);
        return <button type="button" key={row.id} className={`btn-bare ${styles.siteTile}`} aria-pressed={row.id === map.id} onClick={() => onMap(row.id)}>
          {a && <CcbGlyph kind="stagelogo" id={a.logo} className={styles.siteLogo} />}
          <span className={styles.sitePlace}><span className={styles.siteArea}>{row.area}</span><strong>{row.name}</strong></span>
          <span className={styles.siteRisk}>▲{maxRisk(row)}</span>
        </button>;
      })}
    </div>
    <p className={styles.hubFoot}>{T.archive(Math.min(...seasons.map(row => row.number)), Math.max(...seasons.map(row => row.number)))}</p>
  </section>;
}
