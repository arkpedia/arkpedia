import { ContentArt, ContentImg } from '@/components/content/ContentImage';
import { getFactionIconPath } from '@/lib/operators/classBranchIcons';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { toServerTime } from '@/lib/time/serverDay';
import type { AccountRecord } from '@/lib/account/accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/*
 * The account's profile, drawn as the game's own profile card: the business card style's
 * background, the Doctor's avatar, level, name and ID, the signature, the support units and
 * the medal board, beside when they were hired, the card's theme and what they own. The art
 * is the game's, named by its ids (arkpedia-image-assets' profile-* folders,
 * sync_profile_art.py), and so are the card's own sprites (profile-ui/): the level ring,
 * the icons, the marks and the elite badges. A piece that is not published yet is left
 * out, not broken.
 */

const ELITE = ['E0', 'E1', 'E2'];
const UI = (name: string) => `/profile-ui/${name}.webp`;
// The medal board's positions are a staggered grid: a medal sits 6 units right of its
// row-neighbour and 3 right of the medals in the next row, whose rows slope by half of x,
// and a larger row value is higher on the board (the game puts (6, 12) above (9, 9)).
// One unit is the stylesheet's --medal-unit, smaller on a phone.
const unit = (count: number) => `calc(var(--medal-unit) * ${count})`;

function MedalBoard({ medals, names }: { medals: NonNullable<NonNullable<AccountRecord['profile']>['medals']>; names: Record<string, string> }) {
  const placed = medals.filter((medal) => medal.x != null && medal.y != null) as { id: string; x: number; y: number }[];
  if (!placed.length) {
    return <div className="account-card-medals-list">{medals.map((medal) => <ContentImg key={medal.id} src={`/profile-medals/${medal.id}.webp`} alt={names[medal.id] ?? medal.id} title={names[medal.id]} />)}</div>;
  }
  const row = (medal: { x: number; y: number }) => medal.y - medal.x / 2;
  const minX = Math.min(...placed.map((medal) => medal.x)), minRow = Math.min(...placed.map(row)), maxRow = Math.max(...placed.map(row));
  const width = unit(Math.max(...placed.map((medal) => medal.x)) - minX + 6);
  const height = unit(maxRow - minRow + 6.5);
  return (
    <div className="account-card-medals" style={{ width, height }}>
      {placed.map((medal) => (
        <ContentImg key={`${medal.id}-${medal.x}-${medal.y}`} src={`/profile-medals/${medal.id}.webp`} alt={names[medal.id] ?? medal.id} title={names[medal.id]}
          style={{ left: unit(medal.x - minX), top: unit(maxRow - row(medal)), width: unit(6) }} />
      ))}
    </div>
  );
}

export default function ProfileCard({ account, map, outfits }: { account: AccountRecord; map: GameAccountMap; outfits: number }) {
  const profile = account.profile ?? { level: null, registeredAt: null, secretary: null, bio: null };
  // The game dates the card by its server's day (UTC-7, rolling over at 04:00), not UTC's.
  const hired = profile.registeredAt ? toServerTime(new Date(profile.registeredAt)) : null;
  const theme = profile.nameCard ? map.nameCards?.[profile.nameCard] ?? null : null;
  const subtitle = profile.nameCard ? map.nameCardThemes?.[profile.nameCard] ?? null : null;
  return (
    <div className="account-card">
      {profile.nameCard && <ContentImg className="account-card-bg" src={`/profile-namecards/${profile.nameCard}-bg.webp`} alt="" />}
      <div className="account-card-side">
        {hired && <p className="account-card-tag"><span>Hired</span><b>{hired.getUTCFullYear()}-{hired.getUTCMonth() + 1}-{hired.getUTCDate()}</b></p>}
        <div className="account-card-marks" aria-hidden="true"><ContentArt className="account-card-mark-dots" src={UI('no_use_icon_circle')} /><ContentArt className="account-card-mark-x" src={UI('no_use_icon_x')} /></div>
        {theme && (
          <div className="account-card-theme">
            <span>Theme</span>
            <b>{theme}</b>
            {subtitle && <small>{subtitle}</small>}
          </div>
        )}
        <div className="account-card-prts" aria-hidden="true">
          <ContentImg src={UI('rhodes_island_decor')} alt="" />
          <small>Data provided by PRTS</small>
        </div>
        <div className="account-card-outfits">
          <ContentImg className="account-card-outfits-decor" src={UI('decor_skin')} alt="" aria-hidden="true" />
          <div className="account-card-outfits-count">
            <ContentImg src={UI('icon_skin')} alt="" aria-hidden="true" />
            <span>Outfits Owned</span>
            <b>{outfits}</b>
          </div>
        </div>
        <div className="account-card-hiring">
          <p className="account-card-tag"><span>Operator Hiring Progress</span><ContentImg src={UI('human_resource')} alt="" aria-hidden="true" /></p>
          <b>{profile.hired ?? account.operators.length}</b>
          {!!map.nations?.length && (
            <div className="account-card-nations">
              {map.nations.map((nation) => (
                <span key={nation} className="account-card-nation" title={nation}>
                  <ContentImg src={UI('team_back')} alt="" />
                  <ContentArt src={getFactionIconPath(nation)!} role="img" aria-label={nation} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="account-card-main">
        <div className="account-card-head">
          {profile.nameCard && <ContentImg className="account-card-strip" src={`/profile-namecards/${profile.nameCard}-strip.webp`} alt="" />}
          <div className="account-card-avatar">
            {profile.avatar && <ContentImg src={`/profile-avatars/${profile.avatar}.webp`} alt="" />}
            {profile.level != null && (
              <span className="account-card-level">
                <ContentImg src={UI('level_bg')} alt="" />
                <b>{profile.level}</b>
                <small>LV</small>
              </span>
            )}
          </div>
          <div className="account-card-name">
            <b>{account.doctor ?? 'Doctor'}</b>
            {profile.uid && <span>ID {profile.uid}</span>}
          </div>
          <ContentImg className="account-card-share" src={UI('share_btn')} alt="" aria-hidden="true" />
        </div>
        {profile.bio && <p className="account-card-bio"><ContentImg src={UI('resume_icon')} alt="" aria-hidden="true" />{profile.bio}</p>}
        {!!profile.supports?.length && (
          <div className="account-card-box account-card-assist">
            <div className="account-card-assist-label">
              <ContentImg src={UI('assist_icon')} alt="" aria-hidden="true" />
              <b>Support Unit</b>
              <small>Support Unit</small>
            </div>
            <div className="account-card-supports">
              {profile.supports.map((unit) => (
                <div key={unit.name} className="account-card-support" title={`${unit.name}: ${ELITE[unit.elite] ?? ''} Lv ${unit.level}, potential ${unit.potential}${unit.skill ? `, skill ${unit.skill}` : ''}`}>
                  {unit.rarity != null && <ContentImg className="account-card-support-icon" src={getOperatorIconPath({ name: unit.name, rarity: unit.rarity })} alt={unit.name} />}
                  <span className="account-card-support-level"><small>LV</small>{unit.level}</span>
                  {ELITE[unit.elite] && <ContentImg className="account-card-support-elite" src={UI(`elite_${unit.elite}`)} alt={ELITE[unit.elite]} />}
                </div>
              ))}
            </div>
          </div>
        )}
        {!!profile.medals?.length && (
          <div className="account-card-box account-card-medal-box">
            <MedalBoard medals={profile.medals} names={map.medals ?? {}} />
          </div>
        )}
      </div>
    </div>
  );
}
