import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect, { type SelectOption } from '@/components/ui/StyledSelect';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import SearchInput from '@/components/ui/SearchInput';
import { useNavOffset } from '@/lib/hooks/useNavOffset';
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  StrongholdData,
  StrongholdOperator,
  alliancesForPicker,
  strongholdData,
} from '@/lib/gamemodes/stronghold';
import { operatorFunds, tierFunds } from '@/lib/gamemodes/strongholdPrice';
import { Badge, Funds } from '@/components/gamemodes/StrongholdIcons';
import { buildableAlliances } from '@/lib/gamemodes/strongholdPlaybook';
import { ISOMORPH_ITEM } from '@/lib/gamemodes/strongholdOpening';
import StrongholdCompanion from '@/components/gamemodes/StrongholdCompanion';
import EnemyRecord from '@/components/enemies/EnemyRecord';
import RecordDialog from '@/components/ui/RecordDialog';
import XButton from '@/components/ui/XButton';

type Picker = ReturnType<typeof alliancesForPicker>;

interface Props {
  data: StrongholdData;
  picker: Picker;
}

/**
 * Stronghold Protocol: the reference you read before a run.
 *
 * THE ROSTER IS FLAT AND OPEN. This page used to be a grid -- a column per alliance you
 * picked, a row per dispatch tier -- which meant it started empty and showed nothing at
 * all until you had chosen an alliance. Worse, the attribute was never on it: an
 * operator's row carried art, name and price, and the sentence describing the only
 * thing it does in this mode was one click further in. That is the wrong thing to hide.
 * An operator here IS its attribute; the tier and the price are just what it costs to
 * get one. So all 112 are listed on arrival, each with tier, cost, the alliances it
 * feeds and both attribute sentences in the row.
 *
 * WHICH REVERSES THE OLD FILTER RULE. The grid's filters dimmed non-matches instead of
 * removing them, because removing rows would have wrecked what the grid was for --
 * reading one tier across several alliance columns. A flat list has no such structure to
 * protect, so the facets genuinely filter: AND between facets, OR within one, and the
 * heading says how much of the roster survived. The search box reads the attribute text
 * as well as the name, because "who hits drones" is the actual question and no name
 * answers it.
 *
 * ONE SECTION AT A TIME. The page is a lookup tool: a sticky bar of seven tabs and
 * one search box over all of them, and only the open tab renders below it. While a
 * search is typed each tab carries its hit count, so "Drone" says where the answer
 * lives -- an enemy, a bounty, four operators -- before anything is opened. Within a
 * tab nothing is behind a click: strategies, items and both decision panels are laid
 * out in full, the same row shape as an operator's. The two that keep the
 * row-plus-dialog pattern are enemy pools and bosses -- a pool is thirty-five
 * portraits and a boss is an HP table, rosters rather than descriptions -- and the
 * dialog still opens OVER the page rather than expanding in place, because pushing
 * every row below it down the screen is the one thing this site's layout rule
 * forbids.
 */
/** 937,500 in a row is noise; 938k is the number you compare against. */
function hp(n: number | null): string {
  if (n == null) return '--';
  return n >= 1000 ? `${Math.round(n / 1000).toLocaleString('en-GB')}k HP` : `${n} HP`;
}

/**
 * One collapsed row: art, name, and the figure it is ranked by. The whole row is the
 * button -- a small chevron would be a smaller target for no gain.
 *
 * `icon` omitted means no art slot at all, which is right for the decision panels where
 * nothing has art; `icon={null}` means the slot is there and draws a monogram, so a
 * panel where only some rows resolved still lines up.
 */
function Row({ name, icon, trail, dim, open, onOpen }: {
  name: string;
  icon?: string | null;
  trail?: ReactNode;
  dim?: boolean;
  open?: boolean;
  onOpen: (from: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className={`btn-bare gm-row${dim ? ' dim' : ''}${open ? ' open' : ''}`}
      aria-expanded={open ? true : undefined}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {icon !== undefined && <Badge name={name} icon={icon} />}
      <span className="gm-rowname">{name}</span>
      {trail}
    </button>
  );
}

/** What the sheet is showing. A key rather than the record itself, so it cannot go
 *  stale against the props it was read from. */
type Detail = { kind: 'enemies'; id: string };

/**
 * Where the sheet lies: which list it belongs to, and the box it drops from, measured
 * against that list rather than the viewport so it scrolls with the page and, in the
 * operator grid, with the columns.
 */
interface Open {
  detail: Detail;
  /** The list that owns it -- enemies or bosses, and only one draws the sheet. */
  owner: string;
  top: number;
  left: number;
  width: number;
}

const SHEET_MIN = 300;
/** A sheet holding a list of chips rather than a paragraph. An enemy pool is 35 of
 *  them, and squeezing that into a row's width makes a column two hundred rows long
 *  when the page beside it is empty. */
const SHEET_WIDE = 760;

/** The row's position inside its own list, plus a width worth reading, kept on the
 *  list so it cannot hang off the end of one. */
function place(row: HTMLElement, min: number): { top: number; left: number; width: number } | null {
  const host = row.closest('.gm-anchor') as HTMLElement | null;
  if (!host) return null;
  const r = row.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  // The host is the ceiling, with no floor allowed to beat it: on a phone the list is
  // narrower than SHEET_MIN, and preferring the floor hung the sheet 3px off the panel.
  const width = Math.min(Math.max(r.width, min), h.width);
  const left = Math.max(0, Math.min(r.left - h.left, h.width - width));
  return { top: r.bottom - h.top, left, width };
}

const TABS = [
  ['operators', 'Operators'],
  ['alliances', 'Alliances'],
  ['strategies', 'Strategies'],
  ['items', 'Items'],
  ['enemies', 'Enemies'],
  ['tactical', 'Tactical'],
  ['bounty', 'Bounties'],
] as const;
type TabId = typeof TABS[number][0];

/* Where a change should leave the reader. 'keep' defends the exact position, for a
   change that swaps content of comparable size. 'top' goes no further down than the
   head of the scene, for one that narrows a list to a fraction of itself. */
type Anchor = 'keep' | 'top';

/** One choice in a facet dropdown. */
interface PickOption { id: string; name: string; n?: number | null; icon?: string | null; trail?: ReactNode }

/** A facet row on the site's one dropdown: the badge, the count and the price ride
 *  along in the render slots. */
type PickRow = SelectOption & { icon?: string | null; n?: number | null; trail?: ReactNode };

/**
 * One facet of the roster, as a dropdown that picks a single value.
 *
 * This replaced five rows of chips -- 23 alliances, six tiers, five in-game roles and
 * eleven roles, ninety-odd buttons -- which filled the screen with the machinery of
 * looking rather than with anything looked at. A closed dropdown says what it filters
 * and what it is filtered TO, in the width of the words.
 *
 * It is the site's StyledSelect (components/ui), which draws the alliance badges, the
 * counts and the tier prices through its render slots. It was a hand-built listbox of
 * its own, with 25px rows on the page's ground and the pre-token teal for the current
 * row: one of seven dropdowns on the site (2026-09-25 review, UI-13). The "all" row is
 * the first option (value ''), so clearing a facet is one more row of the same list.
 */
function Pick({ label, value, options, onChange }: {
  label: string;
  value: string | null;
  options: PickOption[];
  onChange: (id: string | null) => void;
}) {
  const rows: PickRow[] = [
    { value: '', label },
    ...options.map((o) => ({ value: o.id, label: o.name, icon: o.icon, n: o.n, trail: o.trail })),
  ];
  return (
    <StyledSelect<PickRow>
      /* .set marks a facet that is narrowing the roster, in teal ("on"): the bar has
         to say at a glance which of the five are doing something. */
      className={`gm-pickbox${value ? ' set' : ''}`}
      label={label}
      value={value ?? ''}
      options={rows}
      onChange={(id) => onChange(id || null)}
      menuMinWidth={220}
      renderOption={(o) => (
        <>
          {o.icon && <Badge name={o.label} icon={o.icon} />}
          <span className="gm-pickoptname">{o.label}</span>
          {o.trail}
          {o.n != null && <span className="gm-pick-n">{o.n}</span>}
        </>
      )}
      /* title, because the trigger is an equal share of the row and the longer role
         names ("Other Alliance Stacker") ellipsize inside it. */
      renderValue={(o) => (
        <>
          {o.icon && <Badge name={o.label} icon={o.icon} />}
          <span className="gm-pickbtnname" title={o.label}>{o.label}</span>
        </>
      )}
    />
  );
}

export default function StrongholdProtocolPage({ data, picker }: Props) {
  /* One value each, not a list. The chips these replaced could stack, and in a year
     of the page nothing needed to: an operator has one tier and one in-game role, so
     two of either is a question about the roster rather than about an operator. The
     nation and the trait alliance are split because they were always read as two
     questions -- which Core am I building, which add-on am I feeding -- and one
     combined list of 23 made you find the divider yourself. */
  const [nation, setNation] = useState<string | null>(null);
  const [trait, setTrait] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [inGame, setInGame] = useState<string | null>(null);
  /* The shop's own question, and only the one: when an item starts appearing. */
  const [itemTier, setItemTier] = useState<string | null>(null);
  /** One box over the whole page: an operator, an item, a decision and an enemy can
   *  all be called "Drone", and which section the answer is in is the thing you do
   *  not know yet. */
  const [query, setQuery] = useState('');
  /** Which section is on screen. One at a time: the page is a lookup tool, and seven
   *  long sections stacked end to end answered "where is it" with "scroll". */
  const [tab, setTab] = useState<TabId>('operators');
  const [open, setOpen] = useState<Open | null>(null);
  /** The three hidden bosses are the mode's one real surprise, so they stay behind a
   *  click. The count is not a spoiler; the names are. */
  const [spoilers, setSpoilers] = useState(false);
  /** Which creature's handbook record is over the page, if any. */
  const [record, setRecord] = useState<{ slug: string; name: string; bossIndex?: number } | null>(null);
  /**
   * Closing a sheet must not yank the page upward.
   *
   * The sheet is absolutely positioned, so it never pushes the rows around, but an
   * absolute box hanging below its container still lengthens the document's scrollable
   * area. Read a long pool at the foot of the Enemies panel and you are scrolled into
   * height that exists only because the sheet is open. Close it and that height goes,
   * the browser clamps the scroll position to whatever is left, and the page appears
   * to jump to somewhere you were not.
   *
   * So the space is kept. On close, whatever height the document loses is added back
   * as padding under the page and the scroll position is restored, which leaves the
   * reader exactly where they were looking with empty space below them. The padding is
   * given up again the moment they scroll far enough up not to be standing on it, so
   * the page does not keep a permanent tail.
   *
   * Applied to the node rather than through state on purpose: it has to be in place in
   * the same frame the sheet leaves, and a re-render is a frame too late.
   */
  const sceneRef = useRef<HTMLElement>(null);
  /** The section bar, which sticks under the site nav, and a marker at its place in
   *  the flow (the bar's own box is wherever it is stuck). */
  const lookupRef = useRef<HTMLDivElement>(null);
  const lookupAnchorRef = useRef<HTMLSpanElement>(null);
  const navOffset = useNavOffset();
  const reserveRef = useRef(0);
  const basePadRef = useRef(0);
  /** Where the reader was before something shortened the page under them. */
  const heldAt = useRef<{ scroll: number; anchor: Anchor } | null>(null);
  /* Bumped by every hold so the restore runs after whatever render follows it,
     whether that was a tab, a sheet, a search or a filter. Batched with the caller's
     own setState, so it costs no extra render. */
  const [holdTick, setHoldTick] = useState(0);
  const hold = (anchor: Anchor = 'keep') => {
    heldAt.current = { scroll: window.scrollY, anchor };
    setHoldTick((t) => t + 1);
  };
  const close = () => { hold(); setOpen(null); };

  /**
   * Narrowing anchors to the top of the scene rather than to where the reader stands.
   *
   * Defending the exact position is right for a change that swaps content of about the
   * same size, and wrong for one that cuts a hundred and twelve operators down to one.
   * There is nothing left to defend four thousand pixels down, and succeeding at it
   * means reserving four thousand pixels of nothing to stand on.
   *
   * Going to the top of the page instead is not right either, and that is the whole
   * lesson here: the search bar is sticky, so at any position past the top of the scene
   * it is already pinned to the top of the viewport, and the reader sees the bar with
   * results under it. Landing at zero unpins it, drops the heading and the companion
   * card back in above, and pushes everything down the screen. That reads as the page
   * jumping even though it went where it was told.
   *
   * So the anchor is the first position at which the bar is pinned: where the bar
   * sits in the flow, less the height it pins at (under the site nav). From anywhere
   * below, the bar does not move at all and only the results under it change, which
   * is what the reader just asked for. From above it, nothing moves. And it bounds
   * the reserve, which no longer depends on how far down the reader had gone before
   * typing.
   *
   * It used to be the top of the scene, which is 210px short of that: the bar dropped
   * from pinned to 256px down the screen and the companion card came back in above
   * it (2026-09-25 review, UC-10). Read from a zero-height marker in the flow just
   * before the bar, because the bar's own box is wherever it is stuck.
   */
  const narrow = <T,>(set: (v: T) => void) => (v: T) => {
    hold('top');
    set(v);
  };

  /**
   * Put the reader back where they were, if the page moved them.
   *
   * Two ways to go about it, and only one of them holds.
   *
   * Watching the scroll and putting it back where it was assumes the browser has
   * already clamped by the time this runs, and it has not reliably: the position can
   * survive the layout and be corrected on the next frame, at which point the effect
   * has looked, seen nothing moved, and returned. That is a jump that arrives after
   * the code that was supposed to stop it.
   *
   * So the shortening is prevented instead of undone. The document's height is taken
   * before the change and again after, and whatever it lost is given straight back as
   * padding. There is then no frame in which the page is too short to hold the reader,
   * so nothing has to be clamped and nothing has to be restored. The scroll is put
   * back too, for the case where the browser was quick about it.
   *
   * The amount is worked out fresh every time, never summed. Adding up each shortfall
   * looks equivalent and is not: typing five letters into the search box is five
   * shortenings, so the reserve grew by the whole of the operator grid and the page
   * kept its original height as one long run of nothing to scroll through. What the
   * reader actually needs is for the document to reach the bottom of their viewport and
   * not one pixel further, which is a subtraction, not a running total. It also means
   * the reserve corrects itself: an over-reserve from an earlier change is given back
   * by the next one rather than carried.
   *
   * useLayoutEffect, not useEffect: this runs after the DOM has changed but before the
   * browser paints, so the page is never drawn short. The server runs neither, and the
   * ref guard means the first paint does not either, so there is no hydration mismatch
   * to warn about.
   */
  useLayoutEffect(() => {
    const was = heldAt.current;
    heldAt.current = null;
    if (!was || !sceneRef.current) return;
    /* The scene carries a padding of its own already, and writing a reserve over it
       takes away more than the reserve gives back whenever the shortfall is the smaller
       of the two. Read the real padding once, while nothing is reserved on top of it,
       and add to it from there. */
    if (!reserveRef.current) {
      basePadRef.current = parseFloat(getComputedStyle(sceneRef.current).paddingBottom) || 0;
    }
    /* Where the reader should end up. Read from the scene, which is statically
       positioned, so its offset is the same number whether or not the browser has
       already clamped the scroll out from under us. */
    const sceneTop = sceneRef.current.getBoundingClientRect().top + window.scrollY;
    const marker = lookupAnchorRef.current;
    const pinsAt = marker && lookupRef.current
      ? marker.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(lookupRef.current).top) || 0)
      : sceneTop;
    const target = was.anchor === 'top' ? Math.min(was.scroll, Math.max(0, Math.round(pinsAt))) : was.scroll;
    /* What the page would measure with nothing reserved on it, and what a reader
       standing at the target needs it to reach. The gap between the two is the whole of
       the answer. Position zero is reachable on any page, so it never needs one. */
    const natural = document.documentElement.scrollHeight - reserveRef.current;
    let reserve = target > 0 ? Math.max(0, target + window.innerHeight - natural) : 0;
    const scene = sceneRef.current;
    const apply = () => {
      reserveRef.current = reserve;
      scene.style.paddingBottom = reserve ? `${basePadRef.current + reserve}px` : '';
    };
    apply();
    /* The page is never shorter than the viewport (a min-height on the layout), and
       that floor swallows the first part of a reserve: narrowed to one operator the
       content is 710px, the document measures its 1,000px floor, and a reserve worked
       out from that measure left the page 250px short of the target -- the reader
       landed at 0 and the pinned bar dropped 250px down the screen (measured
       2026-09-25). So check what the document actually reaches and top up the
       shortfall; once the content clears the floor, padding adds one for one. */
    for (let pass = 0; pass < 3 && target > 0; pass += 1) {
      const short = target + window.innerHeight - document.documentElement.scrollHeight;
      if (short <= 0) break;
      reserve += short;
      apply();
    }
    if (window.scrollY !== target) window.scrollTo(0, target);
  }, [holdTick]);

  /* Changing tab shortens the page the same way closing a sheet does: Items is 59 rows
     and Enemies is seven tiles, so pressing Enemies from the foot of Items leaves the
     document unable to hold the scroll position. Same hold, same restore. */
  const goTab = (id: TabId) => { hold(); setTab(id); };

  /* Handed back as the reader climbs off it. */
  useEffect(() => {
    const onScroll = () => {
      if (!reserveRef.current || !sceneRef.current) return;
      /* The same subtraction the reserve was set by, so climbing back up hands the
         space back a bit at a time instead of holding all of it until one point where
         it all goes at once. Only ever downward: growing it here would be this
         listener chasing its own scroll. */
      const natural = document.documentElement.scrollHeight - reserveRef.current;
      const wants = window.scrollY + window.innerHeight;
      const reserve = Math.min(reserveRef.current, Math.max(0, wants - natural));
      if (reserve === reserveRef.current) return;
      reserveRef.current = reserve;
      sceneRef.current.style.paddingBottom = reserve ? `${basePadRef.current + reserve}px` : '';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /** Clicking a row opens the sheet under it; clicking the same row again closes it. */
  const opener = (owner: string, next: Detail) => (row: HTMLElement) => {
    setOpen((was) => {
      if (was && was.owner === owner && JSON.stringify(was.detail) === JSON.stringify(next)) {
        /* Pressing the open row again is a close like any other, and it loses the
           same height. Without this the one close a reader performs most often was
           the one that still jumped. */
        hold();
        return null;
      }
      const at = place(row, owner === 'enemies' ? SHEET_WIDE : SHEET_MIN);
      return at ? { detail: next, owner, ...at } : null;
    });
  };
  const isOpen = (next: Detail) => !!open && JSON.stringify(open.detail) === JSON.stringify(next);

  useEffect(() => {
    if (!open) return undefined;
    /* The record is in front, so Escape is its to answer first -- shutting the pool
       sheet out from under it would leave the record standing over nothing. */
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !record) close(); };
    // Anything outside the sheet dismisses it, except the row that opened it -- that
    // one toggles, and closing here first would make the toggle open it straight back.
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      /* The record counts as inside: it is opened FROM the sheet and reading it must
         not dismiss the pool it was opened from. */
      if (el?.closest('.gm-sheet') || el?.closest('.gm-row') || el?.closest('.record-dialog-wrap')) return;
      close();
    };
    // Measured on open, so a resize would leave it hanging off its row. The sideways
    // -scrolling rail that also had to close it went with the alliance grid; every
    // list that still opens a sheet sits in normal page flow.
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', close);
    };
  }, [open, record]);

  /** Every role in the roster. Computed over all 112 rather than over a selection:
   *  the facets are how you make a selection, so they cannot depend on having made
   *  one. A role nobody has is still never offered. */
  const offered = useMemo(() => {
    const role = new Set<string>();
    const inGame = new Set<string>();
    for (const op of data.operators) {
      op.role.forEach((r) => role.add(r));
      inGame.add(op.in_game_role);
    }
    return { role: [...role].sort(), inGame: [...inGame].sort() };
  }, [data.operators]);

  /** Read off the items rather than hard-coded: a season that adds a kind of item
   *  should offer it here without anyone remembering to add it. */
  const itemFacets = useMemo(() => {
    const tiers = new Set<string>();
    for (const it of data.items) if (it.tier) tiers.add(it.tier);
    return { tiers: data.tiers.filter((t) => tiers.has(t)) };
  }, [data.items, data.tiers]);

  /**
   * What the Damazti Isomorph turns into, paired with each piece of equipment.
   *
   * The item's own text never names an alliance. It says it copies the equipment
   * beside it, and the equipment says nothing about alliances either, so the pairing
   * is knowable only from the Isomorph's talent and a reader looking at either half
   * has no way to work out the other. Fourteen rows of three icons say the whole of
   * it without a sentence.
   */
  const isomorphPairs = useMemo(() => {
    const items = new Map(data.items.map((i) => [i.name, i]));
    return Object.entries(ISOMORPH_ITEM)
      .map(([alliance, item]) => ({
        alliance,
        allianceIcon: picker.find((a) => a.alliance === alliance)?.icon ?? null,
        item,
        itemIcon: items.get(item)?.icon ?? null,
      }))
      .sort((a, b) => a.alliance.localeCompare(b.alliance));
  }, [data.items, picker]);
  const isomorph = useMemo(
    () => data.items.find((i) => i.name === 'Damazti Isomorph') ?? null,
    [data.items],
  );
  const [isoOpen, setIsoOpen] = useState(false);

  const needle = query.trim().toLowerCase();

  /**
   * Searching the ATTRIBUTE, not just the name.
   *
   * "who hits drones" and "what refunds Funds" are the questions this page is opened
   * with, and neither is answerable from a list of names. The attribute text is where
   * those answers live, so it is part of the haystack.
   */
  const hits = (op: StrongholdOperator) => {
    if (!needle) return true;
    return (
      op.operator.toLowerCase().includes(needle)
      || (op.base_attribute || '').toLowerCase().includes(needle)
      || (op.promoted_attribute || '').toLowerCase().includes(needle)
      || op.alliances.some((a) => a.toLowerCase().includes(needle))
      || op.role.some((r) => r.toLowerCase().includes(needle))
      || op.in_game_role.toLowerCase().includes(needle)
    );
  };

  /**
   * The roster, filtered rather than highlighted.
   *
   * The grid this replaced dimmed non-matches instead of dropping them, because
   * removing rows would have broken what the grid was FOR -- reading one tier across
   * several alliance columns. There is no such structure to protect in a flat list:
   * every facet is an AND, a non-match is simply not shown, and the count in the
   * heading says how much of the roster is left.
   *
   * Every facet is an AND across facets and a single value within one, so there is no
   * combination of them that is empty by construction.
   */
  const visible = useMemo(() => {
    const rank = (t: string) => data.tiers.indexOf(t);
    return data.operators
      .filter((op) => {
        if (nation && !op.alliances.includes(nation)) return false;
        if (trait && !op.alliances.includes(trait)) return false;
        if (tier && op.tier !== tier) return false;
        if (inGame && op.in_game_role !== inGame) return false;
        if (role && !op.role.includes(role)) return false;
        return hits(op);
      })
      .sort((a, b) => rank(a.tier) - rank(b.tier) || a.operator.localeCompare(b.operator));
    // `hits` closes over `needle`, which is derived from query -- listed so the filter
    // re-runs on typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.operators, data.tiers, nation, trait, tier, inGame, role, needle]);

  /** The alliance list answers the same box. `warning` is in the haystack because
   *  "does not stack" is a thing people search for by its own words. */
  const shownAlliances = useMemo(() => picker.filter((a) => {
    if (!needle) return true;
    return (
      a.alliance.toLowerCase().includes(needle)
      || (a.effect || '').toLowerCase().includes(needle)
      || (a.warning || '').toLowerCase().includes(needle)
      || a.alliance_type.toLowerCase().includes(needle)
    );
  }), [picker, needle]);

  /**
   * The same box, over the other five.
   *
   * A term is chased across the whole mode rather than one list at a time: "Drone" is
   * an enemy, a bounty decision and the thing four operators are good against, and
   * which of those you meant is not knowable from the word. Each row is matched on its
   * own words -- name, effect, warning, and whatever else it carries that someone would
   * type -- and a section with no hits takes itself off the page.
   */
  const has = (...parts: (string | null | undefined)[]) =>
    !needle || parts.some((t) => (t || '').toLowerCase().includes(needle));

  const shownStrategies = useMemo(
    () => data.strategies.filter((x) => has(x.leader, x.initiator, x.effect, x.warning, x.how_to_unlock)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.strategies, needle],
  );
  const shownItems = useMemo(
    () => data.items
      .filter((x) => !itemTier || x.tier === itemTier)
      .filter((x) => has(x.name, x.type, x.tier, x.base_effect, x.advanced_effect, x.description)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.items, needle, itemTier],
  );
  /** A pool matches on its own name or on any creature in it, so "Sarkaz" finds the
   *  pool that fields them even though the pool is not called that. */
  const shownGroups = useMemo(
    () => data.enemyGroups.filter((g) => has(g.group, g.description, ...g.enemies.flatMap((e) => [e.name, e.code]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.enemyGroups, needle],
  );

  const filtersOn = !!(nation || trait || tier || role || inGame || itemTier || needle);
  /** Whether an alliance is one of the two currently picked, for the rows that light
   *  the alliance they were matched on. Two facets now, so it is no longer one list. */
  const litAlliance = (a: string) => a === nation || a === trait;

  /** How many rows each tab would show for the current search -- the badge that says
   *  where the answer lives before any tab is opened. Bosses ride the Enemies tab,
   *  and the hidden three stay uncounted until spoilers are on, as everywhere. */
  const tabHits: Record<TabId, number> = {
    operators: visible.length,
    alliances: shownAlliances.length,
    strategies: shownStrategies.length,
    items: shownItems.length,
    enemies: shownGroups.length
      + data.bosses.filter((b) => (spoilers || !b.hidden) && has(b.name, b.code)).length,
    tactical: data.tacticalDecisions.filter((d) => has(d.name, d.effect, d.warning, d.enemy, d.affects)).length,
    bounty: data.bountyDecisions.filter((d) => has(d.name, d.effect, d.warning, d.enemy, d.affects)).length,
  };
  const clearAll = () => {
    setNation(null); setTrait(null); setTier(null); setRole(null); setInGame(null);
    setItemTier(null); setQuery('');
  };


  /**
   * The detail, as a sheet that drops from the row and LIES OVER the rows below --
   * measured against its own list, so nothing reflows and nothing below moves. It is
   * rendered by the list that owns it, which is why every list passes its own name.
   */
  const sheet = (owner: string) => {
    if (!open || open.owner !== owner) return null;
        const { detail } = open;
    const shown = ((): {
          eyebrow: string; title: string; icon?: string | null; trail?: ReactNode; body: ReactNode;
        } | null => {
          const g = data.enemyGroups.find((x) => x.group === detail.id);
          if (!g) return null;
          return {
            eyebrow: 'Enemy pool',
            title: g.group,
            icon: g.icon ?? null,
            trail: <span className="gm-tag">{g.enemies.length}</span>,
            body: (
              <>
                {g.description && <p className="gm-effect">{g.description}</p>}
                {/* Faces, not a table of names. Thirty-five rows of code-plus-name was
                    a wall of text for a list whose whole job is "do I recognise this
                    thing", and the picture answers that faster than the name does.
                    Pressing one opens the handbook's record for it -- the stats, the
                    immunities and the stages, which is what you wanted the name FOR. */}
                <div className="enemy-faces">
                  {g.enemies.map((e) => (
                    <button
                      key={`${e.code}-${e.name}`}
                      type="button"
                      className="btn-bare enemy-face"
                      title={`${e.code ? `${e.code} · ` : ''}${e.name}`}
                      aria-label={`${e.name}${e.code ? `, ${e.code}` : ''}`}
                      /* A creature the handbook has no record of cannot be opened, and
                         says so rather than opening an empty box. All 119 resolve
                         today; this is what happens when the two lists drift. */
                      disabled={!e.slug}
                      onClick={() => e.slug && setRecord({ slug: e.slug, name: e.name })}
                    >
                      {e.icon && <Image src={e.icon} alt="" width={72} height={72} unoptimized />}
                      <b>{e.code}</b>
                    </button>
                  ))}
                </div>
              </>
            ),
          };
        })();


    if (!shown) return null;
    return (
      <div
        className={`gm-sheet${open.owner === 'enemies' ? ' wide' : ''}`}
        style={{ top: open.top, left: open.left, width: open.width }}
        role="dialog"
        aria-modal="false"
        aria-label={shown.title}
      >
        <XButton className="gm-sheetclose" onClick={close} label="Close" />
        <div className="gm-sheethead">
          {shown.icon !== undefined && <Badge name={shown.title} icon={shown.icon} />}
          <div className="gm-modaltitle">
            <div className="eyebrow">{shown.eyebrow}</div>
            <h3 className="entity-title entity-title-xs">{shown.title}</h3>
          </div>
          {shown.trail}
        </div>
        {shown.body}
      </div>
    );
  };

  return (
    <>
      <PageMeta title="Stronghold Protocol" description="Stronghold Protocol: alliances and their operators by dispatch tier, plus strategies, decisions, items and enemies." path="/gamemodes/stronghold-protocol" />

      {/* The eyebrow's crumb is the way back to Game Modes: it was a separate
          "< Game Modes" link above the eyebrow, saying the same thing twice.
          No blurb. What the page holds is what the buttons below say it holds.
          The companion banner is the header's action: the one way out to a run in
          progress, as against this page, which is the reference you read beforehand.
          A button rather than a link: the companion is a window THIS page owns, and
          the click that asks for it has to be the click that opens it -- a hop to a
          second page spent the gesture on navigating and then wanted another one. */}
      <PageHeader
        slim
        eyebrow={<>Rhodes Island // <Link prefetch={false} href="/game-modes">Game Modes</Link>{' // Mode reference'}</>}
        title="Stronghold Protocol"
        actions={<StrongholdCompanion data={data} picker={buildableAlliances(picker)} />}
      />

      {/* gm-mode scopes this page's larger icons. It must stay OFF the companion,
          which shares every gm- class with this page and is drawn at 390px. */}
      <main className="terminal-scene gm-mode" ref={sceneRef}>

      {/* The whole page answers to this bar: one tab per section, shown one at a
          time, and one search box over all seven. While a search is typed each tab
          carries its hit count, so "Drone" says where the answer lives -- an enemy,
          a bounty, four operators -- without opening anything. Sticky, because it IS
          the tool and the sections under it are long. */}
      <span className="gm-lookup-anchor" ref={lookupAnchorRef} aria-hidden="true" />
      {/* Sticks under the site nav, measured (lib/hooks/useNavOffset): at `top: 0` it
          spent the page under the fixed nav, and not one of the seven tabs could be
          clicked once it pinned. */}
      <div className="gm-lookup" ref={lookupRef} style={navOffset == null ? undefined : { top: navOffset }}>
        {/* The site's tabs: one section shows at a time, and the strip is a real
            tablist over the seven panels below. It was a button of its own (28px, the
            pre-token teal), then SegmentedControl chips; the first label now starts
            on the page's left edge, under the h1. */}
        <Tabs
          label="Sections"
          id="gm-section"
          value={tab}
          onChange={goTab}
          options={TABS.map(([id, label]) => ({ value: id, label, count: needle ? tabHits[id] : undefined }))}
        />
        <div className="gm-searchrow">
          {/* The site's one search field (components/ui/SearchInput), which also keeps
              the browser out of it: autocomplete and spellcheck are off there, because
              a remembered string once came back as a suggestion that looked like the
              page rendering markup, and operator names are not words. */}
          <SearchInput
            className="gm-search"
            name="stronghold-search"
            label="Search the whole mode"
            value={query}
            onChange={(v) => { hold('top'); setQuery(v); }}
            placeholder="Search names, attributes, alliances, effects..."
          />
          <button type="button" className="ghost gm-clear" hidden={!filtersOn} onClick={clearAll}>
            Clear all
          </button>
        </div>
      </div>

      {/* --- the filter bar ---------------------------------------------------- */}
      {/* Facets are a roster idea -- tier, role, alliance -- so the panel only rides
          the Operators tab. The search box lives in the bar above, over everything. */}

      {/* --- the roster ------------------------------------------------------- */}
      <section className="panel terminal-panel wide gm-anchor" data-tab="Operators" hidden={tab !== 'operators'} {...tabPanelProps('gm-section', 'operators')}>
        <div className="stage-section-head op-section">
          <h2>The roster, by dispatch tier</h2>
          {/* The count, as the Items panel says it. "tier - cost - what it does" was a
              key to the columns, which the columns say for themselves. */}
          <span className="terminal-pill">
            {filtersOn ? `${visible.length} of ${data.operators.length}` : data.operators.length}
          </span>
        </div>
        {/* One row of dropdowns instead of ninety-odd chips. Each says what it
            filters until something is chosen, then says the choice -- so the bar reads
            as the current question and its answer, and costs one line either way. */}
        <div className="gm-filterbar">
          <Pick
            label="All nation alliances"
            value={nation}
            onChange={narrow(setNation)}
            options={picker.filter((a) => a.alliance_type === 'Core')
              .map((a) => ({ id: a.alliance, name: a.alliance, n: a.operators, icon: a.icon }))}
          />
          <Pick
            label="All trait alliances"
            value={trait}
            onChange={narrow(setTrait)}
            options={picker.filter((a) => a.alliance_type === 'Add-on')
              .map((a) => ({ id: a.alliance, name: a.alliance, n: a.operators, icon: a.icon }))}
          />
          <Pick
            label="All tiers"
            value={tier}
            onChange={narrow(setTier)}
            /* The price rides along, because "what does tier V cost" is a question you
               ask before picking one -- it was on the chips for the same reason. */
            options={data.tiers.map((t) => ({
              id: t,
              name: `Tier ${t}`,
              trail: <Funds n={tierFunds(data.tierCosts, t)} title={`Tier ${t} costs ${tierFunds(data.tierCosts, t)} Funds`} />,
            }))}
          />
          <Pick
            label="All in-game roles"
            value={inGame}
            onChange={narrow(setInGame)}
            options={offered.inGame.map((r) => ({ id: r, name: r }))}
          />
          <Pick
            label="All roles"
            value={role}
            onChange={narrow(setRole)}
            options={offered.role.map((r) => ({ id: r, name: r }))}
          />
        </div>
        {visible.length === 0 ? (
          <p className="hint gm-empty">
            Nothing matches that. <button type="button" className="ghost" onClick={clearAll}>Clear the filters</button>
          </p>
        ) : (
          <div className="gm-oplist">
            {visible.map((op) => {
              const cost = operatorFunds(op, data.tierCosts);
              return (
                <article key={op.operator} className="gm-oprow">
                  <span className="gm-opwho">
                    <Badge name={op.operator} icon={op.icon} />
                    <span className="gm-opname">
                      <b>{op.operator}</b>
                      {/* The game's own class first, then what it is editorially FOR.
                          Both, because "Prep" and "Refund" answer different questions. */}
                      <span className="gm-oproles">
                        {[op.in_game_role, ...op.role].filter(Boolean).join(' \u00b7 ')}
                      </span>
                    </span>
                  </span>

                  {/* Tier and price together: the tier is what the shop sorts by and
                      the price is what it costs, and one without the other is half an
                      answer. `stated` marks the one operator whose price is not its
                      tier's. */}
                  <span className="gm-opcost">
                    <span className="gm-optier" title={`Dispatch tier ${op.tier}`}>{op.tier}</span>
                    <Funds
                      n={cost.funds}
                      title={cost.stated
                        ? `${op.operator} costs ${cost.funds} Funds, which is not tier ${op.tier}'s price`
                        : `Tier ${op.tier} costs ${cost.funds} Funds`}
                    />
                  </span>

                  <span className="gm-opfeeds">
                    {op.alliances.map((a) => (
                      <span
                        key={a}
                        className={`gm-feed${litAlliance(a) ? ' lit' : ''}`}
                      >
                        {a}
                      </span>
                    ))}
                  </span>

                  {/* The reason the page exists. Not the operator's normal skill --
                      this is the Stronghold attribute, which is the only thing that
                      acts in this mode. Promoted sits under it, dimmer, because it is
                      the same operator later rather than a second operator. */}
                  <div className="gm-opwhat">
                    <p className="gm-effect">{op.base_attribute}</p>
                    {cost.stated && (
                      <p className="gm-flavour">
                        Costs {cost.funds} instead of the {tierFunds(data.tierCosts, op.tier)} its
                        tier would.
                      </p>
                    )}
                    {op.promoted_attribute && (
                      <p className="gm-effect promoted">
                        <span className="gm-gainlabel">Promoted</span> {op.promoted_attribute}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* --- the alliances ---------------------------------------------------- */}
      <section className="panel terminal-panel wide" data-tab="Alliances" hidden={tab !== 'alliances'} {...tabPanelProps('gm-section', 'alliances')}>
        <div className="stage-section-head op-section">
          <h2>What each alliance pays out</h2>
          <span className="terminal-pill">
            {needle ? `${shownAlliances.length} of ${picker.length}` : picker.length}
          </span>
        </div>
        {shownAlliances.length === 0 ? (
          <p className="hint gm-empty">No alliance matches that.</p>
        ) : (
          <div className="gm-oplist">
            {shownAlliances.map((a) => (
              <article
                key={a.alliance}
                className={`gm-oprow${litAlliance(a.alliance) ? ' lit' : ''}`}
              >
                <span className="gm-opwho">
                  <Badge name={a.alliance} icon={a.icon} />
                  <span className="gm-opname">
                    <b>{a.alliance}</b>
                    <span className="gm-oproles">{a.alliance_type}</span>
                  </span>
                </span>

                {/* How many DIFFERENT operators have to be on the field. Without it the
                    bonus text reads as though it were always on. */}
                <span className="gm-opcost">
                  {a.operators_to_activate != null && (
                    <span className="gm-optier" title={`Needs ${a.operators_to_activate} different operators on the field`}>
                      {a.operators_to_activate}&times;
                    </span>
                  )}
                  <span className="gm-feed">{a.operators} ops</span>
                </span>

                <span className="gm-opfeeds" />

                <div className="gm-opwhat">
                  <p className="gm-effect">{a.effect || 'No bonus recorded for this one.'}</p>
                  {a.warning && <p className="gm-warn">{a.warning}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* --- the other five --------------------------------------------------- */}
      <section className="panel terminal-panel wide" data-tab="Strategies" hidden={tab !== 'strategies'} {...tabPanelProps('gm-section', 'strategies')}>
        <div className="stage-section-head op-section">
          <h2>Leaders and what they open with</h2>
          <span className="terminal-pill">
            {needle ? `${shownStrategies.length} of ${data.strategies.length}` : data.strategies.length}
          </span>
        </div>
        {/* Laid out in full, the same shape as an operator's row. These were rows you
            clicked open one at a time, which made comparing two leaders a memory
            exercise -- and what a strategy IS is its effect text. */}
        {shownStrategies.length === 0 && <p className="hint gm-empty">No strategy matches that.</p>}
        <div className="gm-oplist">
          {shownStrategies.map((s) => (
            <article key={s.leader} className="gm-oprow">
              <span className="gm-opwho">
                <Badge name={s.leader} icon={s.icon} />
                <span className="gm-opname">
                  <b>{s.leader}</b>
                  {s.initiator && s.initiator !== s.leader && (
                    <span className="gm-oproles">{s.initiator}</span>
                  )}
                </span>
              </span>
              <span className="gm-opcost">
                {s.life_points != null && (
                  <span className="gm-optier" title={`Starts the run with ${s.life_points} Life Points`}>
                    {s.life_points} LP
                  </span>
                )}
              </span>
              <span className="gm-opfeeds" />
              <div className="gm-opwhat">
                <p className="gm-effect">{s.effect}</p>
                {s.warning && <p className="gm-warn">{s.warning}</p>}
                {s.how_to_unlock && <p className="gm-flavour">{s.how_to_unlock}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel terminal-panel wide" data-tab="Items" hidden={tab !== 'items'} {...tabPanelProps('gm-section', 'items')}>
        <div className="stage-section-head op-section">
          <h2>Equipment and what it costs</h2>
          <span className="terminal-pill">
            {needle ? `${shownItems.length} of ${data.items.length}` : data.items.length}
          </span>
        </div>
        {/* The same bar the roster has. Tier only: kind was three Arts pieces against
            fifty-six Equipment, which is not a cut anybody needs to make. */}
        <div className="gm-filterbar gm-itemfilter">
          <Pick
            label="All tiers"
            value={itemTier}
            onChange={narrow(setItemTier)}
            options={itemFacets.tiers.map((t) => ({
              id: t,
              name: `Tier ${t}`,
              n: data.items.filter((x) => x.tier === t).length,
            }))}
          />
        </div>
        {shownItems.length === 0 && <p className="hint gm-empty">No item matches that.</p>}
        <div className="gm-oplist">
          {shownItems.map((it) => (
            <article key={it.name} className="gm-oprow">
              {/* The Isomorph is the one item whose entry cannot be read on its own:
                  what it becomes depends on the equipment beside it, and neither the
                  item nor the equipment says so. Its name opens the table instead. */}
              {it.name === 'Damazti Isomorph' ? (
                <button
                  type="button"
                  className="btn-bare gm-opwho gm-isoopen"
                  onClick={() => setIsoOpen(true)}
                  title="Show every pairing"
                >
                  <Badge name={it.name} icon={it.icon} />
                  <span className="gm-opname">
                    <b>{it.name}</b>
                    <span className="gm-oproles">{it.type} &middot; {isomorphPairs.length} pairings</span>
                  </span>
                </button>
              ) : (
                <span className="gm-opwho">
                  <Badge name={it.name} icon={it.icon} />
                  <span className="gm-opname">
                    <b>{it.name}</b>
                    <span className="gm-oproles">{it.type}</span>
                  </span>
                </span>
              )}
              <span className="gm-opcost">
                {it.tier && <span className="gm-optier" title={`Appears from Dispatch tier ${it.tier}`}>{it.tier}</span>}
                {it.price != null && <Funds n={it.price} title={`${it.price} Funds`} />}
              </span>
              <span className="gm-opfeeds" />
              <div className="gm-opwhat">
                {it.base_effect && <p className="gm-effect">{it.base_effect}</p>}
                {it.advanced_effect && (
                  <p className="gm-effect promoted">
                    <span className="gm-gainlabel">Advanced</span> {it.advanced_effect}
                  </p>
                )}
                {it.description && <p className="gm-flavour">{it.description}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel terminal-panel wide" data-tab="Enemies" hidden={tab !== 'enemies'} {...tabPanelProps('gm-section', 'enemies')}>
        <div className="stage-section-head op-section">
          <h2>The mode&rsquo;s own enemy groups</h2>
          <span className="terminal-pill">
            {needle ? `${shownGroups.length} of ${data.enemyGroups.length}` : data.enemyGroups.length}
          </span>
        </div>
        {shownGroups.length === 0 && <p className="hint gm-empty">No enemy pool matches that.</p>}
        {/* The pool's OWN glyph, at the size the game draws it, and no name beside it.
            Seven pools whose names are all "Tactical Training/<something>" spent most
            of a row repeating the two words they share; the glyph is what the mode's
            selector shows and what a player recognises. The name is not lost -- it is
            the tooltip, the label a screen reader reads, and the heading of the sheet
            that opens on a press. */}
        <div className="gm-pools gm-anchor">
          {shownGroups.map((g) => (
            <button
              key={g.group}
              type="button"
              className={`gm-pool${isOpen({ kind: 'enemies', id: g.group }) ? ' open' : ''}`}
              aria-expanded={isOpen({ kind: 'enemies', id: g.group })}
              aria-label={`${g.group}, ${g.enemies.length} enemies`}
              title={g.group}
              onClick={(e) => opener('enemies', { kind: 'enemies', id: g.group })(e.currentTarget)}
            >
              {g.icon && <Image src={g.icon} alt="" width={96} height={96} unoptimized />}
              <span className="gm-tag">{g.enemies.length}</span>
            </button>
          ))}
          {sheet('enemies')}
        </div>
      </section>

      <section className="panel terminal-panel wide" data-tab="Bosses" hidden={tab !== 'enemies'}>
        <div className="stage-section-head op-section">
          <h2>What the whole run is building an answer to</h2>
          <span className="terminal-pill">
            {data.bosses.filter((b) => spoilers || !b.hidden).length}
          </span>
        </div>
        <div className="gm-list gm-anchor">
          {data.bosses
            .map((b, i) => ({ b, i }))
            /* Spoilers first: a hidden boss stays hidden even when its name is typed,
               or the search would be a way round the gate. */
            .filter(({ b }) => spoilers || !b.hidden)
            .filter(({ b }) => has(b.name, b.code))
            .map(({ b, i }) => (
              <Row
                key={`${b.name}-${i}`}
                name={b.name}
                icon={b.icon}
                /* Straight to the handbook record, in one press. It used to open a
                   sheet holding the HP table and you pressed again to reach the
                   record, which is two steps to the thing you wanted; the HP table
                   rides along inside the record now, above the handbook's own panel.
                   Dimmed rather than silently inert if the boss list and the handbook
                   ever drift -- all ten resolve today. */
                dim={!b.slug}
                onOpen={() => b.slug && setRecord({ slug: b.slug, name: b.name, bossIndex: i })}
                trail={(
                  <>
                    {b.hidden && <span className="gm-tag">Hidden</span>}
                    <span className="gm-hp">{hp(b.hp.standard)}</span>
                  </>
                )}
              />
            ))}
        </div>
        {/* Always laid out, so revealing does not also move the button under the
            cursor. Closes any open sheet, which might belong to a row being hidden. */}
        <button
          type="button"
          className="ghost gm-spoiler"
          aria-pressed={spoilers}
          onClick={() => { setSpoilers((v) => !v); close(); }}
        >
          {spoilers
            ? 'Hide the three that stay secret'
            : `Show the ${data.bosses.filter((b) => b.hidden).length} that stay secret`}
        </button>
      </section>

      {([
        { title: 'Tactical', blurb: 'Decisions offered between battles', rows: data.tacticalDecisions },
        { title: 'Bounty', blurb: 'Decisions that put something on the field for a reward', rows: data.bountyDecisions },
      ] as const).map((group) => (
        <section
          key={group.title}
          className="panel terminal-panel wide"
          data-tab={group.title}
          hidden={tab !== (group.title === 'Bounty' ? 'bounty' : 'tactical')}
          {...tabPanelProps('gm-section', group.title === 'Bounty' ? 'bounty' : 'tactical')}
        >
          <div className="stage-section-head op-section">
            <h2>{group.blurb}</h2>
            <span className="terminal-pill">
              {needle
                ? `${group.rows.filter((d) => has(d.name, d.effect, d.warning, d.enemy, d.affects)).length} of ${group.rows.length}`
                : group.rows.length}
            </span>
          </div>
          {group.rows.every((d) => !has(d.name, d.effect, d.warning, d.enemy, d.affects))
            && <p className="hint gm-empty">No decision matches that.</p>}
          <div className="gm-oplist">
            {/* Keyed by position, not name: two tactical decisions are both "Flawless". */}
            {group.rows.map((d, i) => ({ d, i }))
              .filter(({ d }) => has(d.name, d.effect, d.warning, d.enemy, d.affects))
              .map(({ d, i }) => (
                <article key={`${d.name}-${i}`} className="gm-oprow">
                  {/* Pressable when the decision fields one nameable creature, which is
                      123 of the 129 bounties -- the same handbook record a pool's face
                      opens, since "adds 1 Wraith Leader" is worth knowing the stats of
                      before you take it. The six that field an OpFor faction rather
                      than a creature stay a plain row: there is no one record to open.
                      The button is .gm-opwho itself rather than something inside it, so
                      it keeps the flex layout and the .gm-mode gap already written for
                      that class. */}
                  {(() => {
                    const who = (
                      <>
                        <Badge name={d.name} icon={d.icon} />
                        <span className="gm-opname">
                          <b>{d.name}</b>
                          {d.enemy && <span className="gm-oproles">{d.enemy}</span>}
                        </span>
                      </>
                    );
                    const rec = d.handbookEnemy ?? null;
                    return rec ? (
                      <button
                        type="button"
                        className="btn-bare gm-opwho gm-opwho-rec"
                        title={`Open the handbook record for ${rec.name}`}
                        onClick={() => setRecord(rec)}
                      >
                        {who}
                      </button>
                    ) : (
                      <span className="gm-opwho">{who}</span>
                    );
                  })()}
                  <span className="gm-opcost">
                    {d.affects && <span className="gm-affects">{d.affects}</span>}
                    {d.pointing_stick && <span className="gm-tag">Pointing stick</span>}
                  </span>
                  <span className="gm-opfeeds" />
                  <div className="gm-opwhat">
                    <p className="gm-effect">{d.effect}</p>
                    {d.warning && <p className="gm-warn">{d.warning}</p>}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}

      </main>

      {/* Outside <main>, because it lies over the whole page rather than in the flow
          of any one section, and it must not be clipped by the sheet it was opened
          from. Keyed on the slug so a second creature gets a fresh panel instead of
          the last one's open tab and chosen level. */}
      {/* Every pairing at once, as three icons and two operators. No prose, because
          the sentence would be the same fourteen times over with two nouns swapped,
          and the icons are what the shop screen actually shows you. */}
      {isoOpen && (
        <RecordDialog label="Damazti Isomorph pairings" className="gm-isorecord" onClose={() => setIsoOpen(false)}>
            <div className="gm-sheethead">
              <Badge name="Damazti Isomorph" icon={isomorph?.icon ?? null} />
              <div className="gm-modaltitle">
                <div className="eyebrow">Equipment</div>
                <h3 className="entity-title entity-title-xs">Damazti Isomorph</h3>
              </div>
            </div>
            <p className="gm-effect">
              Carrying the Isomorph and one other piece of equipment makes that operator
              a member of the alliance the pairing names.
            </p>
            <div className="gm-isogrid">
              {isomorphPairs.map((p) => (
                <div key={p.alliance} className="gm-isorow" title={`Damazti Isomorph + ${p.item} = ${p.alliance}`}>
                  <Badge name="Damazti Isomorph" icon={isomorph?.icon ?? null} />
                  <b aria-hidden="true">+</b>
                  <Badge name={p.item} icon={p.itemIcon} />
                  <b aria-hidden="true">=</b>
                  <Badge name={p.alliance} icon={p.allianceIcon} />
                  <span className="visually-hidden">
                    {`Damazti Isomorph plus ${p.item} gives ${p.alliance}`}
                  </span>
                </div>
              ))}
            </div>
        </RecordDialog>
      )}

      {record && (
        <EnemyRecord
          key={record.slug}
          slug={record.slug}
          name={record.name}
          /* A boss brings the mode's own numbers with it. The handbook knows the
             creature; only this season knows what it is given at each difficulty, and
             that used to live in a sheet the reader had to open first. */
          intro={(() => {
            const b = record.bossIndex != null ? data.bosses[record.bossIndex] : null;
            if (!b) return null;
            return (
              <div className="gm-bosshp">
                <p className="eyebrow gm-bosshp-kicker">
                  {b.hidden ? `Hidden boss \u00b7 round ${b.round}` : `Boss \u00b7 round ${b.round}`}
                </p>
                <div className="gm-hptable">
                  {([
                    ['Standard', b.hp.standard],
                    ['Perilous', b.hp.perilous],
                    ['Ultimate', b.hp.ultimate],
                    ['Training', b.hp.training],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="gm-hprow">
                      <span className="gm-detaillabel">{label}</span>
                      <span className="gm-hp">{hp(value)}</span>
                    </div>
                  ))}
                </div>
                {b.weight != null && (
                  <p className="gm-flavour">
                    Drawn at weight {b.weight}
                    {b.hidden
                      ? ' among the hidden three, which only open once the round before is survived.'
                      : ' against the others that can open the round.'}
                  </p>
                )}
              </div>
            );
          })()}
          onClose={() => setRecord(null)}
        />
      )}
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/gamemodes/stronghold-protocol", async () => {
  const data = strongholdData();
  return { props: { data, picker: alliancesForPicker(data) } };
});
