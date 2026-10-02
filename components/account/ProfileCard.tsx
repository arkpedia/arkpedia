import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';
import { ContentArt, ContentImg } from '@/components/content/ContentImage';
import { assistantArtPath, portraitPath, profileArtPath } from '@/lib/account/portraits';
import { getFactionIconPath } from '@/lib/operators/classBranchIcons';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { toServerTime } from '@/lib/time/serverDay';
import type { AccountRecord, SupportUnit } from '@/lib/account/accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/*
 * The account's profile, drawn as the game's own profile card: the business card style's
 * background, the Doctor's avatar, level, name and ID, the signature, the support units and
 * the medal board, beside when they were hired, the card's theme and what they own. The art
 * is the game's, named by its ids (arkpedia-image-assets' profile-* folders,
 * sync_profile_art.py), and so are the card's own sprites (profile-ui/): the level ring,
 * the icons, the marks and the elite badges. A piece that is not published yet is left
 * out, not broken.
 *
 * Each theme has its colours (its accent and its panels', which the game keeps in the theme's
 * own bundle: scripts/imports/import-namecard-styles.py) and its head panel art, in the
 * variant the player picked; a theme without one of its own (Default Skin and its kind)
 * shows the assistant's illustration and name instead. The right-hand panels are the first
 * three of the player's own order, and the arrow hides them, as the game's does.
 */

const ELITE = ['E0', 'E1', 'E2'];
// What the game's card shows with no order kept: the signature, the support units, the medals.
const DEFAULT_PANELS = ['module_sign', 'module_assist', 'module_medal'];
// Default Skin's, for a theme whose colours have not been read yet.
const DEFAULT_STYLE = { theme: '#0098dc', themeText: '#323232', panel: '#0000004d', panelText: '#ffffffb2', panelIcon: '#ffffff4d' };
const UI = (name: string) => `/profile-ui/${name}.webp`;
// The roster's faction filter spells two nations its own way (lib/operators/factionAliases).
const ROSTER_FACTION: Record<string, string> = { 'Yan-Lungmen': 'Lungmen', Ægir: 'Aegir' };

/** Each nation's operators on Global (Amiya once), and which the account does not have yet:
 *  the game lights a nation's emblem only once every one of them is hired. */
function nationProgress(map: GameAccountMap, owned: ReadonlySet<string>): Map<string, { total: number; missing: string[] }> {
  const progress = new Map<string, { total: number; missing: string[] }>();
  for (const char of Object.values(map.chars)) {
    if (!char.nation || !char.global || char.formOf) continue;
    const entry = progress.get(char.nation) ?? { total: 0, missing: [] };
    entry.total += 1;
    if (!owned.has(char.name)) entry.missing.push(char.name);
    progress.set(char.nation, entry);
  }
  return progress;
}
// The medal board's positions are a staggered grid: a medal sits 6 units right of its
// row-neighbour and 3 right of the medals in the next row, whose rows slope by half of x,
// and a larger row value is higher on the board (the game puts (6, 12) above (9, 9)).
// One unit is the stylesheet's --medal-unit, smaller on a phone.
const unit = (count: number) => `calc(var(--medal-unit) * ${count})`;

/** A support unit as the game's card shows it: its portrait in the outfit it wears, or its
 *  roster icon on a record from before outfits were kept, or until a new outfit's portrait
 *  is published. */
function SupportTile({ unit }: { unit: SupportUnit }) {
  const [portrait, setPortrait] = useState(true);
  const src = unit.skin && portrait ? portraitPath(unit.skin) : unit.rarity != null ? getOperatorIconPath({ name: unit.name, rarity: unit.rarity }) : null;
  return (
    <div className="account-card-support" title={`${unit.name}: ${ELITE[unit.elite] ?? ''} Lv ${unit.level}, potential ${unit.potential}${unit.skill ? `, skill ${unit.skill}${unit.mastery ? ` at M${unit.mastery}` : ''}` : ''}`}>
      {src && <ContentImg key={src} className={unit.skin && portrait ? 'account-card-support-icon account-card-support-portrait' : 'account-card-support-icon'} src={src} alt={unit.name} onError={unit.skin && portrait ? () => setPortrait(false) : undefined} />}
      <span className="account-card-support-level"><small>LV</small>{unit.level}</span>
      <span className="account-card-support-marks">
        {ELITE[unit.elite] && <ContentImg className="account-card-support-elite" src={UI(`elite_${unit.elite}`)} alt={ELITE[unit.elite]} />}
        {unit.mastery === 3 && <ContentImg className="account-card-support-mastery" src={UI('spec_max_icon')} alt="Mastery 3" />}
      </span>
    </div>
  );
}

function MedalBoard({ medals, names }: { medals: NonNullable<NonNullable<AccountRecord['profile']>['medals']>; names: Record<string, string> }) {
  const placed = medals.filter((medal) => medal.x != null && medal.y != null) as { id: string; x: number; y: number }[];
  if (!placed.length) {
    return <div className="account-card-medals-list">{medals.map((medal) => <ContentImg key={medal.id} src={profileArtPath('profile-medals', medal.id)} alt={names[medal.id] ?? medal.id} title={names[medal.id]} />)}</div>;
  }
  const row = (medal: { x: number; y: number }) => medal.y - medal.x / 2;
  const minX = Math.min(...placed.map((medal) => medal.x)), minRow = Math.min(...placed.map(row)), maxRow = Math.max(...placed.map(row));
  const width = unit(Math.max(...placed.map((medal) => medal.x)) - minX + 6);
  const height = unit(maxRow - minRow + 6.5);
  return (
    <div className="account-card-medals" style={{ width, height }}>
      {placed.map((medal) => (
        <ContentImg key={`${medal.id}-${medal.x}-${medal.y}`} src={profileArtPath('profile-medals', medal.id)} alt={names[medal.id] ?? medal.id} title={names[medal.id]}
          style={{ left: unit(medal.x - minX), top: unit(maxRow - row(medal)), width: unit(6) }} />
      ))}
    </div>
  );
}

/** The highest main story episode the account has cleared a stage of (main_14-01: 14). */
function mainEpisode(cleared: string[]): number | null {
  let best: number | null = null;
  for (const id of cleared) {
    const match = /^main_(\d+)-/.exec(id);
    if (match && (best === null || Number(match[1]) > best)) best = Number(match[1]);
  }
  return best;
}

/* React 18 does not know inert: it drops `inert={true}` and passes a string through, while
   its types say boolean. */
const hiddenUnless = (shown: boolean) => (shown ? {} : { inert: '' } as unknown as { inert: boolean });

export default function ProfileCard({ account, map, outfits, outfitArt }: {
  account: AccountRecord; map: GameAccountMap; outfits: number;
  /** Each outfit's art by its game id, for the assistant on a theme without one of its own. */
  outfitArt: ReadonlyMap<string, string>;
}) {
  const profile = account.profile ?? { level: null, registeredAt: null, secretary: null, bio: null };
  // The game dates the card by its server's day (UTC-7, rolling over at 04:00), not UTC's.
  const hired = profile.registeredAt ? toServerTime(new Date(profile.registeredAt)) : null;
  const style = profile.nameCard ?? null;
  const theme = style ? map.nameCards?.[style] ?? null : null;
  const subtitle = style ? map.nameCardThemes?.[style] ?? null : null;
  // No style kept, or one without a theme of its own: the assistant takes the theme's place.
  const plain = !style || (map.nameCardPlain ?? []).includes(style);
  const variants = style ? map.nameCardVariants?.[style] : undefined;
  const head = style ? profileArtPath('profile-namecards', `${style}-head${variants ? `-${Math.min(profile.nameCardVariant ?? 0, variants - 1)}` : ''}`) : null;
  const assistant = plain && profile.secretarySkin ? assistantArtPath(profile.secretarySkin, map.chars, outfitArt) : null;
  const colours = (style && map.nameCardStyles?.[style]) || DEFAULT_STYLE;
  const panels = (profile.panels?.length ? profile.panels : DEFAULT_PANELS).slice(0, 3);
  const nations = useMemo(() => nationProgress(map, new Set(account.operators)), [map, account.operators]);
  /* The arrow hides the right-hand panels. Both views stay mounted in the same grid cell and
     cross-fade, so the card keeps the panels' height and hiding them never shortens the page
     under the reader (the Anti-Page Jump rule). The one not shown is inert: out of the tab
     order and the accessibility tree while it still fades. */
  const [collapsed, setCollapsed] = useState(false);

  const avatar = (
    <div className="account-card-avatar">
      {profile.avatar && <ContentImg src={profileArtPath('profile-avatars', profile.avatar)} alt="" />}
      {profile.level != null && (
        <span className="account-card-level">
          <ContentImg src={UI('level_bg')} alt="" />
          <b>{profile.level}</b>
          <small>LV</small>
        </span>
      )}
    </div>
  );
  const panel = (id: string) => {
    if (id === 'module_sign') {
      return <p key={id} className="account-card-bio"><ContentArt className="account-card-icon" src={UI('resume_icon')} aria-hidden="true" />{profile.bio}</p>;
    }
    if (id === 'module_assist') {
      return (
        <div key={id} className="account-card-box account-card-assist">
          <div className="account-card-assist-label">
            <ContentArt className="account-card-icon" src={UI('assist_icon')} aria-hidden="true" />
            <b>Support Unit</b>
            <small>Support Unit</small>
          </div>
          <div className="account-card-supports">
            {(profile.supports ?? []).map((unit) => <SupportTile key={unit.name} unit={unit} />)}
          </div>
        </div>
      );
    }
    if (id === 'module_medal') {
      return (
        <div key={id} className="account-card-box account-card-medal-box">
          {!!profile.medals?.length && <MedalBoard medals={profile.medals} names={map.medals ?? {}} />}
        </div>
      );
    }
    if (id === 'module_equip') {
      const modules = profile.modules;
      return (
        <div key={id} className="account-card-box account-card-modules">
          <ContentImg className="account-card-modules-bg" src={UI('module_collection_bg')} alt="" aria-hidden="true" />
          <ContentArt className="account-card-icon" src={UI('module_collection_bg_icon')} aria-hidden="true" />
          <dl>
            <div><dt>Modules collected</dt><dd>{modules?.collected ?? '—'}</dd></div>
            <div><dt>STAGE3 Module</dt><dd>{modules?.stage3 ?? '—'}</dd></div>
            <div><dt>Operators with Modules</dt><dd>{modules?.operators ?? '—'}</dd></div>
          </dl>
        </div>
      );
    }
    const episode = mainEpisode(account.cleared);
    return (
      <div key={id} className="account-card-box account-card-mainline">
        <ContentImg className="account-card-mainline-art" src={UI('mainline_human')} alt="" aria-hidden="true" />
        <ContentArt className="account-card-icon" src={UI('mainline_icon')} aria-hidden="true" />
        <div><small>Main Theme</small><b>{episode === null ? '—' : episode === 0 ? 'Prologue' : `Episode ${episode}`}</b></div>
      </div>
    );
  };

  return (
    <div className={`account-card${collapsed ? ' is-collapsed' : ''}`}
      style={{ '--card-accent': colours.theme, '--card-accent-text': colours.themeText, '--card-panel': colours.panel, '--card-panel-text': colours.panelText,
        '--card-panel-icon': colours.panelIcon } as CSSProperties}>
      {style && <ContentImg className="account-card-bg" src={profileArtPath('profile-namecards', `${style}-bg`)} alt="" />}
      {assistant && <ContentImg className="account-card-assistant" src={assistant} alt="" />}
      <div className="account-card-side">
        {hired && <p className="account-card-tag"><span>Hired</span><b>{hired.getUTCFullYear()}-{hired.getUTCMonth() + 1}-{hired.getUTCDate()}</b></p>}
        <div className="account-card-marks" aria-hidden="true"><ContentArt className="account-card-mark-dots" src={UI('no_use_icon_circle')} /><ContentArt className="account-card-mark-x" src={UI('no_use_icon_x')} /></div>
        {plain ? (
          profile.secretary && <div className="account-card-theme"><span>Assistant</span><b>{profile.secretary}</b></div>
        ) : theme && (
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
          <Link prefetch={false} href="/skins?owned=missing" className="account-card-outfits-count account-card-link" title="The outfits you don't have">
            <ContentImg src={UI('icon_skin')} alt="" aria-hidden="true" />
            <span>Outfits Owned</span>
            <b>{outfits}</b>
          </Link>
        </div>
        <div className="account-card-hiring">
          <p className="account-card-tag"><span>Operator Hiring Progress</span><ContentImg src={UI('human_resource')} alt="" aria-hidden="true" /></p>
          <Link prefetch={false} href="/operators?owned=missing" className="account-card-hired account-card-link" title="The operators you don't have">{profile.hired ?? account.operators.length}</Link>
          {!!map.nations?.length && (
            <div className="account-card-nations">
              {map.nations.map((nation) => {
                const { total = 0, missing = [] } = nations.get(nation) ?? {};
                const complete = total > 0 && missing.length === 0;
                const label = `${nation}: ${total - missing.length} of ${total} hired${missing.length ? `. Not yet: ${missing.join(', ')}` : ''}`;
                return (
                  <Link key={nation} prefetch={false} href={`/operators?faction=${encodeURIComponent(ROSTER_FACTION[nation] ?? nation)}${complete ? '' : '&owned=missing'}`}
                    className={`account-card-nation${complete ? ' is-complete' : ''}`} title={label} aria-label={label}>
                    <ContentImg src={UI('team_back')} alt="" />
                    <ContentArt src={getFactionIconPath(nation)!} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="account-card-simple" {...hiddenUnless(collapsed)}>
        <div className="account-card-name"><b>{account.doctor ?? 'Doctor'}</b>{profile.uid && <span>ID {profile.uid}</span>}</div>
        {avatar}
      </div>
      <div className="account-card-main" {...hiddenUnless(!collapsed)}>
        <div className="account-card-head">
          {head && <ContentImg className="account-card-head-art" src={head} alt="" />}
          {avatar}
          <div className="account-card-name">
            <b>{account.doctor ?? 'Doctor'}</b>
            {profile.uid && <span>ID {profile.uid}</span>}
          </div>
        </div>
        {panels.map(panel)}
      </div>
      <button type="button" className="btn-bare account-card-extend" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Show the profile details' : 'Hide the profile details'} title={collapsed ? 'Show the details' : 'Hide the details'}>
        <ContentImg src={UI('extend_btn')} alt="" />
      </button>
    </div>
  );
}
