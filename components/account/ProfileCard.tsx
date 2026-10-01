import { ContentImg } from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { AccountRecord } from '@/lib/account/accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/*
 * The account's profile, drawn as the game's own profile card: the business card style's
 * background, the Doctor's avatar, level, name and ID, the signature, the support units and
 * the medal board, beside when they were hired, the card's theme and what they own. The art
 * is the game's, named by its ids (arkpedia-image-assets' profile-* folders,
 * sync_profile_art.py); a piece that is not published yet is left out, not broken.
 */

const ELITE = ['E0', 'E1', 'E2'];
// The medal board's positions are a staggered grid: a medal sits 6 units right of its
// row-neighbour and 3 right of the medals in the next row, whose rows slope by half of x,
// and a larger row value is higher on the board (the game puts (6, 12) above (9, 9)).
const MEDAL_UNIT = 8;

function MedalBoard({ medals, names }: { medals: NonNullable<NonNullable<AccountRecord['profile']>['medals']>; names: Record<string, string> }) {
  const placed = medals.filter((medal) => medal.x != null && medal.y != null) as { id: string; x: number; y: number }[];
  if (!placed.length) {
    return <div className="account-card-medals-list">{medals.map((medal) => <ContentImg key={medal.id} src={`/profile-medals/${medal.id}.webp`} alt={names[medal.id] ?? medal.id} title={names[medal.id]} />)}</div>;
  }
  const row = (medal: { x: number; y: number }) => medal.y - medal.x / 2;
  const minX = Math.min(...placed.map((medal) => medal.x)), minRow = Math.min(...placed.map(row)), maxRow = Math.max(...placed.map(row));
  const width = (Math.max(...placed.map((medal) => medal.x)) - minX + 6) * MEDAL_UNIT;
  const height = (maxRow - minRow + 6.5) * MEDAL_UNIT;
  return (
    <div className="account-card-medals" style={{ width, height }}>
      {placed.map((medal) => (
        <ContentImg key={`${medal.id}-${medal.x}-${medal.y}`} src={`/profile-medals/${medal.id}.webp`} alt={names[medal.id] ?? medal.id} title={names[medal.id]}
          style={{ left: (medal.x - minX) * MEDAL_UNIT, top: (maxRow - row(medal)) * MEDAL_UNIT, width: 6 * MEDAL_UNIT }} />
      ))}
    </div>
  );
}

export default function ProfileCard({ account, map, outfits }: { account: AccountRecord; map: GameAccountMap; outfits: number }) {
  const profile = account.profile ?? { level: null, registeredAt: null, secretary: null, bio: null };
  const hired = profile.registeredAt ? new Date(profile.registeredAt) : null;
  const theme = profile.nameCard ? map.nameCards?.[profile.nameCard] ?? null : null;
  const [name, number] = (account.doctor ?? 'Doctor').split('#');
  return (
    <div className="account-card">
      {profile.nameCard && <ContentImg className="account-card-bg" src={`/profile-namecards/${profile.nameCard}-bg.webp`} alt="" />}
      <div className="account-card-side">
        {hired && <p className="account-card-tag"><span>Hired</span>{hired.getUTCFullYear()}-{hired.getUTCMonth() + 1}-{hired.getUTCDate()}</p>}
        {theme && <div className="account-card-theme"><span>Theme</span><b>{theme}</b></div>}
        <div className="account-card-stat"><span>Outfits owned</span><b>{outfits}</b></div>
        <div className="account-card-stat account-card-hired"><span>Operators hired</span><b>{profile.hired ?? account.operators.length}</b></div>
      </div>
      <div className="account-card-main">
        <div className="account-card-head">
          {profile.nameCard && <ContentImg className="account-card-strip" src={`/profile-namecards/${profile.nameCard}-strip.webp`} alt="" />}
          <div className="account-card-avatar">
            {profile.avatar && <ContentImg src={`/profile-avatars/${profile.avatar}.webp`} alt="" />}
            {profile.level != null && <span className="account-card-level"><b>{profile.level}</b>LV</span>}
          </div>
          <div className="account-card-name">
            <b>{name}<small>#{number ?? ''}</small></b>
            {profile.uid && <span>ID {profile.uid}</span>}
          </div>
        </div>
        {profile.bio && <p className="account-card-bio">{profile.bio}</p>}
        {!!profile.supports?.length && (
          <div className="account-card-box">
            <span className="account-card-box-label">Support units</span>
            <div className="account-card-supports">
              {profile.supports.map((unit) => (
                <div key={unit.name} className="account-card-support" title={`${unit.name}: ${ELITE[unit.elite] ?? ''} Lv ${unit.level}, potential ${unit.potential}${unit.skill ? `, skill ${unit.skill}` : ''}`}>
                  {unit.rarity != null && <ContentImg src={getOperatorIconPath({ name: unit.name, rarity: unit.rarity })} alt={unit.name} />}
                  <span>{ELITE[unit.elite]} · Lv {unit.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!!profile.medals?.length && (
          <div className="account-card-box">
            <span className="account-card-box-label">Medals</span>
            <MedalBoard medals={profile.medals} names={map.medals ?? {}} />
          </div>
        )}
      </div>
    </div>
  );
}
