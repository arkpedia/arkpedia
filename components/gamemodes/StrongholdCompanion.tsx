import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  StrongholdData,
  StrongholdEnemyGroup,
  StrongholdOperator,
} from '@/lib/gamemodes/stronghold';
import { POOL_NEEDS, poolTail } from '@/lib/gamemodes/plannerNeeds';
import { byTier, nudgeFor } from '@/lib/gamemodes/strongholdPlaybook';
import { Badge } from '@/components/gamemodes/StrongholdIcons';
import {
  COPIERS, FREE_CHOICE, GUIDE, ISOMORPH_CHOICE, ISOMORPH_ITEM, NEW_PLAYER_EXTRA_ACCESS, OPENING,
  SIX_STAR_OPERATORS, goodStackerMap, lockdownMap, nudgeMap, openingFor, type OpeningFor,
} from '@/lib/gamemodes/strongholdOpening';
import PipWindow, { pipSupported, usePipWindow } from '@/components/ui/PipWindow';
/* The address the New tab button points at and the phone link navigates to. Its own
   module because _document needs it too, before the first paint; see the file. */
import { COMPANION_PAGE, COMPANION_POPOUT } from '@/lib/gamemodes/companionRoute';
import CompanionScrollRow from '@/components/gamemodes/CompanionScrollRow';
import { useWakeLock } from '@/lib/hooks/useWakeLock';
import { useQueryState } from '@/lib/hooks/useQueryState';

/**
 * A stable view-transition-name for one moving thing on the screen.
 *
 * The names are what let the browser animate a tap's reshuffle instead of cutting:
 * an element that keeps its name across a render slides to its new place, one that
 * appears fades in. Names must be CSS idents and unique per document, so operator
 * and alliance names are folded to ascii ("Ch'en" -> chen, "Młynar" -> m-ynar), which is
 * distinct enough for this roster, and each kind gets its own prefix.
 */
function vt(prefix: string, name: string): React.CSSProperties {
  const ident = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  return { viewTransitionName: `${prefix}-${ident}` } as React.CSSProperties;
}

/** The parts of a running view transition withShift needs. TypeScript's DOM
 *  library does not describe startViewTransition, so the shape is named here. */
interface ShiftHandle {
  finished: Promise<void>;
  skipTransition: () => void;
}

interface Picked {
  alliance: string;
  alliance_type: string;
  operators_to_activate: number | null;
  icon: string | null;
  /** The game's own description of what the alliance does, as newline-separated
   *  clauses. Required, not optional: every row alliancesForPicker builds has one --
   *  from the data for the twenty-three it knows, and '' for anything a season adds
   *  that the alliance list has not heard of -- and an optional field here would let a
   *  future caller pass rows without it and quietly render no description at all. */
  effect: string;
}
export interface CompanionProps {
  data: StrongholdData;
  picker: Picked[];
  /** Render the screen as the page itself, with no button and no window. The companion
   *  page uses this: it is where phones land and what the popup fallback opens. */
  standalone?: boolean;
}
type Props = CompanionProps;


/**
 * Shown in the setup screen's header.
 *
 * It exists so a bug report can say which build it was seen on. The companion ships by
 * deploying the site, so there is no store listing or install date to check against and
 * "the one from last week" is not a version. Bump it when the behaviour changes in a
 * way a tester would notice.
 */
const COMPANION_VERSION = 'v1.0';

/**
 * Whether this document has already launched a companion.
 *
 * Module scope on purpose: a module lives exactly as long as the document that
 * loaded it, which is the boundary the launch effect is trying to find, and the one
 * thing a navigation entry cannot see. Leaving the companion page for the Stronghold
 * page and coming back is a client-side navigation. Same document, no new entry, so
 * the effect would read the ORIGINAL load's type and wipe a run mid-play for the
 * crime of tapping the back link. This remembers.
 */
let launched = false;

/** How far the player can take the pop-out's size, and in what steps. Wide enough to
 *  cover a laptop corner and a monitor across the room. Not so wide that the six
 *  portraits on a bundle row stop finding a line. */
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.0;
/**
 * The size the companion's OWN PAGE opens at, for a reader who has never touched the
 * dial. That page is the phone's companion and the desktop's tab, and both want it.
 *
 * 100% is right for the always-on-top window and wrong here. The PiP is a 390px strip
 * you glance at beside the game, where every extra percent costs you screen you are
 * playing on. The page is a whole monitor, or a phone held at arm's length, showing
 * 44px portraits and 9px mono counts. So the PiP still opens at 100% and the page
 * starts here -- see `zoomHome`. A saved value beats both; this is only the start.
 */
const ZOOM_DEFAULT = 1.5;

/** A boss's HP at a glance. 787500 is six digits nobody reads and 788K is a size. */
const hpShort = (n: number | null | undefined) => (
  n == null ? '?' : `${Math.round(n / 1000)}K`
);

/** strategies.json wraps every leader in literal quotes, as in "'Damazti Cluster'". */
const leaderName = (leader: string) => leader.replace(/'/g, '');

/**
 * In the picker for the ban list, not for the plan.
 *
 * Solo and Assist Operator are real alliances. Texas is Solo AND Siracusa, so
 * without them on the ban chips she could never be banned out. But they are not
 * things a run builds towards: no bundle, no squad target, no pivot label. The strip
 * still counts them, because the game's own readout does. */
const NOT_A_PLAN = new Set(['Solo', 'Assist Operator']);

/**
 * How many alliances of each kind a run can rule out, which is the mode's own limit
 * rather than ours. Enforced on the picker so the screen cannot describe a run the
 * game will not deal you.
 */
const BAN_CAP: Record<string, number> = { Core: 3, 'Add-on': 4 };

/**
 * The lowest tier of operator worth drawing a copier combo on.
 *
 * Every copier is itself a Tier IV or V unit. Ptilopsis and Civilight Eterna sit at
 * IV, Saria and Suzuran at V, so the pairing costs a late slot whatever it is pointed
 * at. Spending one to re-fire a Tier I attribute is not a combo, it is a worse
 * purchase, and the badge said otherwise on every early face in the roster.
 */
const COMBO_FROM_TIER = 'IV';

/**
 * The first shop tier that looks a tier ahead.
 *
 * Tiers I and II do not. The lookahead exists to say "hold your Funds, something
 * better is coming", and at the opening tiers that is bad advice however true it is:
 * the cheap units ARE the run there, the board is empty, and a Tier III farmer named
 * two rounds before it can appear is a distraction from the eight slots that still
 * need filling.
 */
const LOOKAHEAD_FROM_TIER = 'III';

/* RECOMMEND_FLOOR lived here: a rising floor that stopped the Recommended row leading
   with units bought eight rounds ago. BAND_VIEW.greyWhole below says the same thing
   better. Those tiers stay on the shelf, because a late duplicate is still worth
   marking, and are greyed rather than gone. */

/**
 * The four add-ons a run can chase before it commits to anything.
 *
 * They pay out to the WHOLE board rather than to their own members, which is why they
 * are worth aiming at in the opening rounds when the run has no direction yet. They sit
 * on the strip at zero for Dispatch I and II so the player can press one and read who
 * is in it. An alliance you are told to aim for and cannot find is advice with no
 * handle on it.
 */
const OPENERS = ['Swift', 'Agile', 'Aid', 'Raid'];

/** What each of the four does for every operator, in the game's own words. Shown one
 *  at a time, under the strip, for whichever chip is pressed. */
/**
 * How an alliance's effect text is turned into something readable.
 *
 * The game writes these for its own UI, and pasted straight in they read like a data
 * dump: square-bracketed alliance tags, an angle-bracketed condition welded to the
 * front of the sentence it gates, and "(affected by no. of stacks)" repeated at the end
 * of every clause that scales. All three are structure wearing punctuation, so they are
 * lifted OUT of the sentence and given their own place -- the condition first as a
 * label, the scaling as a tag at the end, the sentence left to be a sentence.
 *
 * Nothing is reworded. Every transform here is mechanical and reversible, which is the
 * only safe kind: these are game facts, and a description that reads beautifully and
 * says something slightly untrue is worse than the paste it replaced.
 *
 * This also replaced a hand-written UNIVERSAL_ATTR table, four alliances' board-wide
 * clauses restated more plainly than the game states them. It had to go: it was
 * appended to the effect text that already contained the same clause, so Agile showed
 * its 40-stack rule twice in two different wordings. What it was FOR -- flagging the
 * clauses that pay every operator rather than only that alliance's own -- is now read
 * off the text itself, so all twenty-three get it instead of four.
 */
const ALLIANCE_TAG = /\[([^\]]+)\]/g;
const CLAUSE_WHEN = /^<([^>]+)>\s*/;
/* A condition can also turn up mid-sentence -- Sargon's third clause reads "When using
   Narantuya's Strategy, <With 6 different Sargon Operators on field> effect changes".
   Only a LEADING one becomes the label, so the angle brackets on the rest would survive
   into the prose as stray punctuation. Turned into ordinary parentheses, which is what
   they already mean there. */
const INLINE_WHEN = /<([^>]+)>/g;
const SCALES = /\s*\(affected by no\. of stacks\)/i;
const BOARD_WIDE = /\ball operators\b/i;

/**
 * The tips, by the tier they belong to and by what the board has become.
 *
 * kukki's words, kept verbatim. They are the voice of the guide and not something to
 * tighten. Each shows until the player marks an operator, because a tip is advice about
 * a decision and the mark IS the decision: having acted on it, they do not need it a
 * second time.
 */
const TIER_TIPS: Record<string, string> = {
  I: 'Right now, you do not have to commit to any core alliances. However, you can aim early for Swift, Agile, Raid (40/50 stacks can buff all operators), and Aid (gives stacks to all active alliances later). Click on the four add-on alliances above to see who you can get. From Round 1 to 5, there are no bad choices, freely choose anyone, but having more operators to use up the deployment limit helps to win more. Do not go for triple copies (promote) until Dispatch Level 3. Get out of Dispatch Level 1 as fast as possible. Ideally by Round 2, which you can upgrade the Dispatch Level and buy an item. Leaking is okay, even when in co-op, think of leaks as leaking early to become stronger for later (hopefully).',
  II: 'You still do not have to commit to any core alliances. Thumbs Up operators are good at stacking their specific alliances. You can get them to lean into core or add-on alliances, but again, you are not locking yourself to any alliances yet. Get out of Dispatch Level 2 as fast as possible as you want to access better alliance stackers quicker.',
  III: 'You may try for triple copies (promote) now. From Dispatch Level 3 to 4, you need to hunt for Star operators. These are \'Committed\' operators that makes you play into the core alliance. As long as you receive one, you can fully send it into playing that core alliance. Greyed out operators are not recommended to obtain until you have found the \'Committed\' operators that synergizes with them via the alliances.',
  IV: 'You need to aggressively hunt for \'Committed\' operators (the Star operators). If you are in co-op mode, please pay attention to your teammates team\'s that they\'re committing towards so as to not play the same alliance as them. Operator pools are shared in this game mode.',
};

/** What the board itself says, which outranks the tier's standing advice. */
const STATE_TIPS: Record<string, string> = {
  'star-1': 'You can now play into this core alliance. You may still pick another \'Committed\' operator if you want to make a sudden switch. Once you have found 3 operators, you can lock down this alliance.',
  'star-2': 'You have 2 \'Committed\' operators, please remove/sell one to decide on which core you want to play.',
  locked: 'This core alliance has been locked down successfully. Happy hunting for the full team!',
  unlocked: 'This core alliance has not been locked down yet, you need to get the \'Committed\' operator to truly sink in. Else you may need to make a sudden switch now by finding another \'Committed operator of a different core alliance.',
};

/** Every language the tip system can be read in, in the order the picker
 *  lists them -- English first (the source language), then the requested
 *  set. */
const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'th', name: 'ไทย' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Malaysia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'pt', name: 'Português' },
];

/**
 * Translations for the tip set keyed the same way tipNow already keys tips:
 * tier-I..tier-IV for the per-band orientation tips, star-1/star-2/locked/
 * unlocked for the reactive ones. Deliberately the shorter, more universal
 * tips only -- CORE_TIPS (the eight long per-alliance strategy tips) and the
 * Isomorph reminder are not translated yet, and tipText's fallback below
 * quietly reads English for any key a language does not have, rather than
 * showing nothing.
 *
 * Game-specific terms (alliance names, Dispatch, Star, Committed) are kept
 * in English within each translated sentence. This tool has no verified
 * source for how the game itself localizes those terms in each of these
 * languages, and guessing wrong would read as a DIFFERENT mechanic than the
 * one on the player's own screen -- worse than leaving the term as the word
 * they already recognise from the game.
 */
const TIP_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    'tier-III': 'Теперь можно пробовать тройные копии (повышение). С 3 по 4 уровень Dispatch нужно охотиться за «звёздными» операторами (Star). Это «Committed»-операторы, которые заставляют вас играть за основной альянс. Получив хотя бы одного, можно полностью посвятить себя этому альянсу. Затемнённых операторов не рекомендуется брать, пока вы не нашли «Committed»-операторов, которые с ними сочетаются через альянсы.',
    'tier-IV': 'Нужно активно охотиться за «Committed»-операторами (звёздными). Если вы играете в кооперативе, следите, к чему стремятся ваши товарищи по команде, чтобы не играть за один и тот же альянс. Пул операторов в этом режиме общий.',
    'star-1': 'Теперь вы можете играть за этот основной альянс. Вы всё ещё можете выбрать другого «Committed»-оператора, если захотите резко сменить направление. Набрав 3 операторов, вы сможете закрепить этот альянс.',
    'star-2': 'У вас 2 «Committed»-оператора — уберите/продайте одного, чтобы определиться, за какой core вы играете.',
    locked: 'Этот основной альянс успешно закреплён. Удачной охоты за оставшейся командой!',
    unlocked: 'Этот основной альянс ещё не закреплён — нужен «Committed»-оператор, чтобы окончательно определиться. Иначе может понадобиться резко сменить направление, найдя «Committed»-оператора другого основного альянса.',
  },
  fr: {
    'tier-III': 'Vous pouvez maintenant tenter les triples exemplaires (promotion). Du niveau 3 à 4 de Dispatch, il faut chasser les opérateurs Étoile (Star). Ce sont des opérateurs «\u00a0Engagés\u00a0» (Committed) qui vous font jouer l\u2019alliance principale. Dès que vous en obtenez un, vous pouvez pleinement vous engager dans cette alliance. Les opérateurs grisés ne sont pas recommandés tant que vous n\u2019avez pas trouvé les opérateurs «\u00a0Engagés\u00a0» qui se synergisent avec eux via les alliances.',
    'tier-IV': 'Vous devez chasser activement les opérateurs «\u00a0Engagés\u00a0» (les opérateurs Étoile). En coopératif, faites attention à l\u2019alliance vers laquelle vos coéquipiers s\u2019engagent, pour ne pas jouer la même. Les pools d\u2019opérateurs sont partagés dans ce mode.',
    'star-1': 'Vous pouvez maintenant jouer cette alliance principale. Vous pouvez encore choisir un autre opérateur «\u00a0Engagé\u00a0» pour changer brusquement de direction. Une fois 3 opérateurs obtenus, vous pouvez verrouiller cette alliance.',
    'star-2': 'Vous avez 2 opérateurs «\u00a0Engagés\u00a0»\u00a0: retirez/vendez-en un pour décider quelle alliance principale vous jouez.',
    locked: 'Cette alliance principale est verrouillée avec succès. Bonne chasse pour compléter l\u2019équipe\u00a0!',
    unlocked: 'Cette alliance principale n\u2019est pas encore verrouillée\u00a0: il vous faut un opérateur «\u00a0Engagé\u00a0» pour vraiment vous fixer. Sinon, vous devrez peut-être changer brusquement de direction en trouvant un opérateur «\u00a0Engagé\u00a0» d\u2019une autre alliance principale.',
  },
  de: {
    'tier-III': 'Jetzt kannst du dreifache Kopien (Beförderung) versuchen. Von Dispatch-Stufe 3 auf 4 musst du nach Stern-Operators (Star) jagen. Das sind „Committed“-Operators, die dich dazu bringen, die Hauptallianz zu spielen. Sobald du einen erhältst, kannst du dich voll auf diese Allianz festlegen. Ausgegraute Operators werden nicht empfohlen, bis du die „Committed“-Operators gefunden hast, die über die Allianzen mit ihnen zusammenwirken.',
    'tier-IV': 'Du musst aggressiv nach „Committed“-Operators (den Stern-Operators) jagen. Achte im Koop-Modus darauf, worauf sich deine Mitspieler festlegen, um nicht dieselbe Allianz zu spielen. Die Operator-Pools werden in diesem Modus geteilt.',
    'star-1': 'Du kannst jetzt diese Hauptallianz spielen. Du kannst noch einen weiteren „Committed“-Operator wählen, falls du plötzlich wechseln willst. Sobald du 3 Operators hast, kannst du diese Allianz festschreiben.',
    'star-2': 'Du hast 2 „Committed“-Operators — entferne/verkaufe einen, um zu entscheiden, welche Hauptallianz du spielst.',
    locked: 'Diese Hauptallianz wurde erfolgreich festgeschrieben. Viel Erfolg bei der Jagd nach dem restlichen Team!',
    unlocked: 'Diese Hauptallianz ist noch nicht festgeschrieben — du brauchst den „Committed“-Operator, um dich wirklich festzulegen. Sonst musst du vielleicht plötzlich wechseln, indem du einen „Committed“-Operator einer anderen Hauptallianz findest.',
  },
  es: {
    'tier-III': 'Ahora puedes intentar triples copias (ascenso). Del nivel 3 al 4 de Dispatch necesitas cazar operadores Estrella (Star). Son operadores «Comprometidos» (Committed) que te hacen jugar la alianza principal. En cuanto consigas uno, puedes volcarte por completo en esa alianza. No se recomienda obtener operadores en gris hasta que hayas encontrado los operadores «Comprometidos» que sinergizan con ellos mediante las alianzas.',
    'tier-IV': 'Debes cazar agresivamente operadores «Comprometidos» (los operadores Estrella). En modo cooperativo, presta atención a hacia qué alianza se están comprometiendo tus compañeros para no jugar la misma. Los pools de operadores se comparten en este modo de juego.',
    'star-1': 'Ahora puedes jugar esta alianza principal. Aún puedes elegir otro operador «Comprometido» si quieres cambiar de repente. Una vez que consigas 3 operadores, puedes cerrar esta alianza.',
    'star-2': 'Tienes 2 operadores «Comprometidos»; quita/vende uno para decidir con qué alianza principal vas a jugar.',
    locked: 'Esta alianza principal quedó cerrada con éxito. ¡Buena caza para completar el equipo!',
    unlocked: 'Esta alianza principal aún no está cerrada; necesitas al operador «Comprometido» para asentarte de verdad. Si no, puede que debas cambiar de repente encontrando un operador «Comprometido» de otra alianza principal.',
  },
  th: {
    'tier-III': 'ตอนนี้คุณลองไล่ล่าสามชุด (เลื่อนขั้น) ได้แล้ว ตั้งแต่ Dispatch ระดับ 3 ถึง 4 คุณต้องล่าโอเปอเรเตอร์ดาว (Star) ซึ่งเป็นโอเปอเรเตอร์ "Committed" ที่ทำให้คุณเล่นพันธมิตรหลักนั้นจริงจัง เมื่อได้มาหนึ่งตัวแล้ว คุณสามารถทุ่มเทให้กับพันธมิตรนั้นได้เต็มที่ โอเปอเรเตอร์ที่เป็นสีเทาไม่แนะนำให้ได้มาจนกว่าจะพบโอเปอเรเตอร์ "Committed" ที่เข้ากันได้ผ่านพันธมิตร',
    'tier-IV': 'คุณต้องไล่ล่าโอเปอเรเตอร์ "Committed" (โอเปอเรเตอร์ดาว) อย่างจริงจัง หากเล่นโหมดร่วมมือ โปรดสังเกตว่าเพื่อนร่วมทีมกำลังผูกมัดกับพันธมิตรใด เพื่อจะได้ไม่เล่นพันธมิตรเดียวกัน พูลโอเปอเรเตอร์ถูกใช้ร่วมกันในโหมดนี้',
    'star-1': 'ตอนนี้คุณสามารถเล่นพันธมิตรหลักนี้ได้แล้ว คุณยังสามารถเลือกโอเปอเรเตอร์ "Committed" ตัวอื่นได้หากต้องการเปลี่ยนทิศทางกะทันหัน เมื่อได้โอเปอเรเตอร์ครบ 3 ตัวแล้ว คุณสามารถล็อกพันธมิตรนี้ได้',
    'star-2': 'คุณมีโอเปอเรเตอร์ "Committed" 2 ตัว โปรดถอด/ขายตัวหนึ่งออกเพื่อตัดสินใจว่าจะเล่นพันธมิตรหลักใด',
    locked: 'พันธมิตรหลักนี้ถูกล็อกสำเร็จแล้ว ขอให้ล่าทีมที่เหลือให้สนุก!',
    unlocked: 'พันธมิตรหลักนี้ยังไม่ถูกล็อก คุณต้องได้โอเปอเรเตอร์ "Committed" เพื่อให้แน่วแน่จริงๆ ไม่เช่นนั้นอาจต้องเปลี่ยนทิศทางกะทันหันโดยหาโอเปอเรเตอร์ "Committed" ของพันธมิตรหลักอื่น',
  },
  ja: {
    'tier-III': 'ここからは3凸（昇進）を狙っても構いません。Dispatchレベル3から4の間は「スター」オペレーターを探す必要があります。これはコア陣営を本格的にプレイさせる『Committed』オペレーターです。1体でも手に入れば、その陣営に全力を注げます。灰色表示のオペレーターは、陣営を通じて相乗効果のある『Committed』オペレーターを見つけるまでは、入手を推奨しません。',
    'tier-IV': '『Committed』オペレーター（スターオペレーター）を積極的に狙う必要があります。協力プレイの場合は、チームメイトがどの陣営にコミットしているか確認し、同じ陣営にならないよう注意してください。このモードではオペレータープールは共有されます。',
    'star-1': 'このコア陣営をプレイできるようになりました。急な方向転換をしたい場合は、別の『Committed』オペレーターを選ぶこともできます。3体揃えば、この陣営を確定できます。',
    'star-2': '『Committed』オペレーターが2体います。どちらのコア陣営でプレイするか決めるため、片方を外す/売却してください。',
    locked: 'このコア陣営の確定に成功しました。残りのチームを楽しく探しましょう！',
    unlocked: 'このコア陣営はまだ確定していません。本当に定着させるには『Committed』オペレーターが必要です。さもないと、別のコア陣営の『Committed』オペレーターを見つけて急遽方向転換する必要があるかもしれません。',
  },
  ko: {
    'tier-III': '이제 3중 카피(승급)를 시도해도 됩니다. Dispatch 레벨 3에서 4까지는 스타(Star) 오퍼레이터를 찾아야 합니다. 이들은 코어 진영을 실제로 플레이하게 만드는 \'Committed\' 오퍼레이터입니다. 한 명이라도 얻으면 그 코어 진영에 완전히 전념할 수 있습니다. 회색으로 표시된 오퍼레이터는 진영을 통해 시너지를 내는 \'Committed\' 오퍼레이터를 찾기 전까지는 획득을 권장하지 않습니다.',
    'tier-IV': '\'Committed\' 오퍼레이터(스타 오퍼레이터)를 적극적으로 찾아야 합니다. 협동 모드라면 같은 진영을 플레이하지 않도록 팀원들이 어떤 진영에 커밋하고 있는지 주의 깊게 살펴보세요. 이 모드에서는 오퍼레이터 풀이 공유됩니다.',
    'star-1': '이제 이 코어 진영을 플레이할 수 있습니다. 갑자기 방향을 바꾸고 싶다면 다른 \'Committed\' 오퍼레이터를 선택할 수도 있습니다. 오퍼레이터 3명을 확보하면 이 진영을 확정할 수 있습니다.',
    'star-2': '\'Committed\' 오퍼레이터가 2명 있습니다. 어느 코어 진영을 플레이할지 결정하기 위해 한 명을 제거/판매하세요.',
    locked: '이 코어 진영이 성공적으로 확정되었습니다. 남은 팀원을 즐겁게 찾아보세요!',
    unlocked: '이 코어 진영은 아직 확정되지 않았습니다. 진짜로 정착하려면 \'Committed\' 오퍼레이터가 필요합니다. 그렇지 않으면 다른 코어 진영의 \'Committed\' 오퍼레이터를 찾아 갑자기 방향을 바꿔야 할 수도 있습니다.',
  },
  zh: {
    'tier-III': '现在可以尝试三凸（精英化）了。从 Dispatch 3 级到 4 级，你需要寻找星标（Star）干员，也就是能让你真正投入核心阵营的『Committed』干员。只要获得一个，就可以完全投入该阵营。在你找到通过阵营与其产生联动的『Committed』干员之前，不建议获取灰色显示的干员。',
    'tier-IV': '你需要积极寻找『Committed』干员（星标干员）。如果是合作模式，请留意队友正在投入哪个阵营，以免与他们重复。此模式下干员池是共享的。',
    'star-1': '现在你可以投入这个核心阵营了。如果想临时改变方向，仍然可以选择另一个『Committed』干员。一旦凑齐 3 名干员，就可以锁定这个阵营。',
    'star-2': '你有 2 名『Committed』干员，请移除/出售一个，以决定要玩哪个核心阵营。',
    locked: '这个核心阵营已成功锁定。祝你顺利凑齐剩余队伍！',
    unlocked: '这个核心阵营尚未锁定，你需要一名『Committed』干员才能真正确定下来。否则可能需要通过找到另一个核心阵营的『Committed』干员来临时改变方向。',
  },
  id: {
    'tier-III': 'Sekarang kamu bisa mencoba triple copy (promosi). Dari Dispatch level 3 ke 4, kamu perlu memburu operator Bintang (Star). Ini adalah operator \'Committed\' yang membuatmu benar-benar memainkan aliansi inti. Begitu kamu mendapat satu, kamu bisa sepenuhnya fokus ke aliansi tersebut. Operator yang berwarna abu-abu tidak disarankan untuk didapatkan sampai kamu menemukan operator \'Committed\' yang bersinergi dengan mereka lewat aliansi.',
    'tier-IV': 'Kamu perlu berburu operator \'Committed\' (operator Bintang) secara agresif. Jika bermain mode co-op, perhatikan aliansi mana yang sedang dikomit oleh rekan timmu agar tidak memainkan aliansi yang sama. Pool operator dibagikan bersama dalam mode ini.',
    'star-1': 'Sekarang kamu bisa memainkan aliansi inti ini. Kamu masih bisa memilih operator \'Committed\' lain jika ingin berpindah arah secara mendadak. Setelah mendapat 3 operator, kamu bisa mengunci aliansi ini.',
    'star-2': 'Kamu punya 2 operator \'Committed\', silakan lepas/jual salah satu untuk memutuskan aliansi inti mana yang ingin dimainkan.',
    locked: 'Aliansi inti ini berhasil dikunci. Selamat berburu untuk melengkapi timmu!',
    unlocked: 'Aliansi inti ini belum terkunci, kamu perlu operator \'Committed\' untuk benar-benar memantapkannya. Jika tidak, kamu mungkin perlu berpindah arah secara mendadak dengan mencari operator \'Committed\' dari aliansi inti lain.',
  },
  ms: {
    'tier-III': 'Sekarang anda boleh cuba salinan tiga (promosi). Dari Dispatch tahap 3 ke 4, anda perlu memburu operator Bintang (Star). Ini ialah operator \'Committed\' yang menjadikan anda benar-benar bermain gabungan teras itu. Sebaik sahaja anda dapat seorang, anda boleh menumpukan sepenuhnya kepada gabungan tersebut. Operator berwarna kelabu tidak disyorkan untuk didapatkan sehingga anda menemui operator \'Committed\' yang bersinergi dengan mereka melalui gabungan.',
    'tier-IV': 'Anda perlu memburu operator \'Committed\' (operator Bintang) secara agresif. Jika bermain mod kerjasama, perhatikan gabungan mana rakan sepasukan anda sedang komited supaya tidak bermain gabungan yang sama. Kumpulan operator dikongsi bersama dalam mod ini.',
    'star-1': 'Sekarang anda boleh bermain gabungan teras ini. Anda masih boleh pilih operator \'Committed\' lain jika mahu bertukar arah secara mendadak. Sebaik sahaja mendapat 3 operator, anda boleh kunci gabungan ini.',
    'star-2': 'Anda mempunyai 2 operator \'Committed\', sila buang/jual seorang untuk memutuskan gabungan teras mana yang anda mahu mainkan.',
    locked: 'Gabungan teras ini berjaya dikunci. Selamat memburu untuk melengkapkan pasukan anda!',
    unlocked: 'Gabungan teras ini belum dikunci — anda perlukan operator \'Committed\' untuk benar-benar mengukuhkannya. Jika tidak, anda mungkin perlu bertukar arah secara mendadak dengan mencari operator \'Committed\' daripada gabungan teras lain.',
  },
  vi: {
    'tier-III': 'Giờ bạn có thể thử bản sao thứ ba (thăng cấp). Từ Dispatch cấp 3 đến 4, bạn cần săn operator Sao (Star). Đây là các operator \'Committed\' khiến bạn thực sự chơi liên minh cốt lõi đó. Chỉ cần có một, bạn có thể dồn toàn lực vào liên minh đó. Không nên lấy các operator bị làm mờ cho đến khi bạn tìm được operator \'Committed\' cộng hưởng với họ qua các liên minh.',
    'tier-IV': 'Bạn cần tích cực săn các operator \'Committed\' (operator Sao). Nếu chơi chế độ hợp tác, hãy chú ý xem đồng đội đang cam kết liên minh nào để tránh trùng. Nguồn operator được chia sẻ trong chế độ này.',
    'star-1': 'Giờ bạn có thể chơi liên minh cốt lõi này. Bạn vẫn có thể chọn một operator \'Committed\' khác nếu muốn đột ngột đổi hướng. Khi có đủ 3 operator, bạn có thể khóa liên minh này.',
    'star-2': 'Bạn có 2 operator \'Committed\', hãy gỡ/bán bớt một để quyết định sẽ chơi liên minh cốt lõi nào.',
    locked: 'Liên minh cốt lõi này đã được khóa thành công. Chúc săn tốt phần đội hình còn lại!',
    unlocked: 'Liên minh cốt lõi này chưa được khóa — bạn cần operator \'Committed\' để thực sự ổn định. Nếu không, bạn có thể phải đột ngột đổi hướng bằng cách tìm operator \'Committed\' của một liên minh cốt lõi khác.',
  },
  pt: {
    'tier-III': 'Agora você pode tentar triplicatas (promoção). Do nível 3 ao 4 de Dispatch, você precisa caçar operadores Estrela (Star). Estes são operadores \'Comprometidos\' (Committed) que fazem você realmente jogar a aliança principal. Assim que conseguir um, pode se dedicar totalmente a essa aliança. Operadores acinzentados não são recomendados até você encontrar os operadores \'Comprometidos\' que sinergizam com eles através das alianças.',
    'tier-IV': 'Você precisa caçar agressivamente operadores \'Comprometidos\' (os operadores Estrela). No modo cooperativo, preste atenção em qual aliança seus companheiros de equipe estão se comprometendo, para não jogar a mesma. Os pools de operadores são compartilhados neste modo.',
    'star-1': 'Agora você pode jogar esta aliança principal. Ainda pode escolher outro operador \'Comprometido\' se quiser mudar de direção repentinamente. Assim que conseguir 3 operadores, pode travar esta aliança.',
    'star-2': 'Você tem 2 operadores \'Comprometidos\'; remova/venda um para decidir com qual aliança principal você vai jogar.',
    locked: 'Esta aliança principal foi travada com sucesso. Boa caçada para completar o time!',
    unlocked: 'Esta aliança principal ainda não foi travada — você precisa do operador \'Comprometido\' para realmente se firmar. Caso contrário, pode precisar mudar de direção repentinamente encontrando um operador \'Comprometido\' de outra aliança principal.',
  },
};

/** English if the language has no entry for this key (or is English itself)
 *  -- CORE_TIPS and the Isomorph reminder currently fall back this way for
 *  every non-English language, since only the shorter tip set above is
 *  translated so far. */
function tipText(language: string, key: string, fallback: string): string {
  return TIP_TRANSLATIONS[language]?.[key] ?? fallback;
}

/**
 * Translations for the setup wizard's own step instructions -- the three
 * sentences telling the player what each step is for. Same fallback
 * contract as tipText: no entry for a language reads the English original.
 *
 * The bans instruction embeds the Setup button's own name mid-sentence; the
 * literal button label stays as "Setup" in every language (it is what is
 * actually printed on the button) with a {{SETUP}} placeholder marking
 * where it goes, split out and re-inserted in bold at render time.
 */
const SETUP_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    pools: 'Выберите 2 (одиночный режим) или 3 (командный режим) группы врагов, которые встретятся в вашем забеге.',
    bans: 'Выберите альянсы, которые ограничены. Вы можете вернуться сюда во время забега — кнопка {{SETUP}} снова открывает этот шаг.',
    strategy: 'Выберите используемую стратегию.',
  },
  fr: {
    pools: 'Sélectionnez les 2 (simulation solo) ou 3 (simulation en équipe) groupes d\u2019ennemis qui apparaissent dans votre partie.',
    bans: 'Sélectionnez les alliances restreintes. Vous pouvez revenir ici pendant la partie \u2014 le bouton {{SETUP}} rouvre cette étape.',
    strategy: 'Sélectionnez la stratégie que vous utilisez.',
  },
  de: {
    pools: 'Wähle die 2 (Solo-Simulation) oder 3 (Team-Simulation) Feindgruppen, die in deinem Lauf vorkommen.',
    bans: 'Wähle die eingeschränkten Allianzen. Du kannst während des Laufs hierher zurückkehren — der {{SETUP}}-Button öffnet diesen Schritt erneut.',
    strategy: 'Wähle die Strategie, die du verwendest.',
  },
  es: {
    pools: 'Selecciona los 2 (simulación en solitario) o 3 (simulación en equipo) grupos de enemigos que aparecen en tu partida.',
    bans: 'Selecciona las alianzas restringidas. Puedes volver aquí durante la partida: el botón {{SETUP}} reabre este paso.',
    strategy: 'Selecciona la estrategia que estás usando.',
  },
  th: {
    pools: 'เลือกกลุ่มศัตรู 2 กลุ่ม (จำลองเดี่ยว) หรือ 3 กลุ่ม (จำลองทีม) ที่จะปรากฏในรอบของคุณ',
    bans: 'เลือกพันธมิตรที่ถูกจำกัด คุณสามารถกลับมาที่นี่ระหว่างรอบได้ — ปุ่ม {{SETUP}} จะเปิดขั้นตอนนี้อีกครั้ง',
    strategy: 'เลือกกลยุทธ์ที่คุณกำลังใช้',
  },
  ja: {
    pools: 'あなたのランで登場する敵グループを、2つ（ソロシミュレーション）または3つ（チームシミュレーション）選んでください。',
    bans: '制限する陣営を選択してください。ラン中にここへ戻ることもできます —「{{SETUP}}」ボタンでこのステップを再度開けます。',
    strategy: '使用する戦略を選択してください。',
  },
  ko: {
    pools: '런에 등장하는 적 그룹을 2개(솔로 시뮬레이션) 또는 3개(팀 시뮬레이션) 선택하세요.',
    bans: '제한할 진영을 선택하세요. 런 도중에도 다시 돌아올 수 있습니다 — {{SETUP}} 버튼을 누르면 이 단계가 다시 열립니다.',
    strategy: '사용할 전략을 선택하세요.',
  },
  zh: {
    pools: '选择你本局中会出现的 2 个（单人模拟）或 3 个（组队模拟）敌人分组。',
    bans: '选择要限制的阵营。你可以在游戏过程中随时回到这里 —— 点击 {{SETUP}} 按钮即可重新打开此步骤。',
    strategy: '选择你正在使用的策略。',
  },
  id: {
    pools: 'Pilih 2 (simulasi solo) atau 3 (simulasi tim) kelompok musuh yang muncul dalam run kamu.',
    bans: 'Pilih aliansi yang dibatasi. Kamu bisa kembali ke sini selama run berlangsung — tombol {{SETUP}} akan membuka langkah ini lagi.',
    strategy: 'Pilih strategi yang kamu gunakan.',
  },
  ms: {
    pools: 'Pilih 2 (simulasi solo) atau 3 (simulasi berpasukan) kumpulan musuh yang muncul dalam larian anda.',
    bans: 'Pilih gabungan yang dihadkan. Anda boleh kembali ke sini semasa larian — butang {{SETUP}} akan membuka semula langkah ini.',
    strategy: 'Pilih strategi yang anda gunakan.',
  },
  vi: {
    pools: 'Chọn 2 (mô phỏng solo) hoặc 3 (mô phỏng đội) nhóm kẻ địch xuất hiện trong lượt chơi của bạn.',
    bans: 'Chọn các liên minh bị hạn chế. Bạn có thể quay lại đây trong lượt chơi — nút {{SETUP}} sẽ mở lại bước này.',
    strategy: 'Chọn chiến lược bạn đang sử dụng.',
  },
  pt: {
    pools: 'Selecione os 2 (simulação solo) ou 3 (simulação em equipe) grupos de inimigos que aparecem na sua run.',
    bans: 'Selecione as alianças restritas. Você pode voltar aqui durante a run — o botão {{SETUP}} reabre esta etapa.',
    strategy: 'Selecione a estratégia que você está usando.',
  },
};

function setupText(language: string, key: string, fallback: string): string {
  return SETUP_TRANSLATIONS[language]?.[key] ?? fallback;
}

/**
 * Every visible button label this screen has, outside the tip system --
 * Setup, New Player, Reset, Collapse, the tip controls, the standing
 * preferences, Owned, Recommended/Filler, Return, the run-start button, the
 * Guide toggle, and the onboarding hint's own dismiss button. Tooltips and
 * aria-labels are not covered here -- this is the text actually printed on
 * each button, which is what a reader without English sees first.
 */
const BUTTON_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    setup: 'Настройка', newPlayer: 'Новичок', reset: 'Сброс', resetSure: 'Точно? Сбросить всё',
    collapse: 'Свернуть', showTip: 'Показать совет', tips: 'Советы', icons: 'Значки',
    descriptions: 'Описания', owned: 'В наличии', recommended: 'Рекомендовано', filler: 'Заполнение',
    return: 'Назад', backToRun: 'К забегу', startRun: 'Начать забег', guide: 'Гайд', gotIt: 'Понятно',
  },
  fr: {
    setup: 'Configuration', newPlayer: 'Nouveau joueur', reset: 'Réinitialiser', resetSure: 'Sûr\u00a0? Tout réinitialiser',
    collapse: 'Réduire', showTip: 'Afficher le conseil', tips: 'Conseils', icons: 'Icônes',
    descriptions: 'Descriptions', owned: 'Possédés', recommended: 'Recommandé', filler: 'Complément',
    return: 'Retour', backToRun: 'Retour à la partie', startRun: 'Démarrer', guide: 'Guide', gotIt: 'Compris',
  },
  de: {
    setup: 'Setup', newPlayer: 'Neuling', reset: 'Zurücksetzen', resetSure: 'Sicher? Alles zurücksetzen',
    collapse: 'Einklappen', showTip: 'Tipp anzeigen', tips: 'Tipps', icons: 'Symbole',
    descriptions: 'Beschreibungen', owned: 'Besitzt', recommended: 'Empfohlen', filler: 'Füllmaterial',
    return: 'Zurück', backToRun: 'Zurück zum Lauf', startRun: 'Lauf starten', guide: 'Anleitung', gotIt: 'Verstanden',
  },
  es: {
    setup: 'Configuración', newPlayer: 'Nuevo jugador', reset: 'Reiniciar', resetSure: '¿Seguro? Reiniciar todo',
    collapse: 'Contraer', showTip: 'Mostrar consejo', tips: 'Consejos', icons: 'Iconos',
    descriptions: 'Descripciones', owned: 'En posesión', recommended: 'Recomendado', filler: 'Relleno',
    return: 'Volver', backToRun: 'Volver a la partida', startRun: 'Iniciar partida', guide: 'Guía', gotIt: 'Entendido',
  },
  th: {
    setup: 'ตั้งค่า', newPlayer: 'ผู้เล่นใหม่', reset: 'รีเซ็ต', resetSure: 'แน่ใจไหม? รีเซ็ตทั้งหมด',
    collapse: 'ย่อ', showTip: 'แสดงเคล็ดลับ', tips: 'เคล็ดลับ', icons: 'ไอคอน',
    descriptions: 'คำอธิบาย', owned: 'ที่มีอยู่', recommended: 'แนะนำ', filler: 'เสริม',
    return: 'กลับ', backToRun: 'กลับสู่รอบ', startRun: 'เริ่มรอบ', guide: 'คู่มือ', gotIt: 'เข้าใจแล้ว',
  },
  ja: {
    setup: 'セットアップ', newPlayer: '初心者向け', reset: 'リセット', resetSure: '本当にすべてリセットしますか？',
    collapse: '折りたたむ', showTip: 'ヒントを表示', tips: 'ヒント', icons: 'アイコン',
    descriptions: '説明', owned: '所持', recommended: 'おすすめ', filler: '補充',
    return: '戻る', backToRun: 'ランに戻る', startRun: 'ラン開始', guide: 'ガイド', gotIt: '了解',
  },
  ko: {
    setup: '설정', newPlayer: '초보자', reset: '초기화', resetSure: '확실합니까? 모두 초기화',
    collapse: '접기', showTip: '팁 보기', tips: '팁', icons: '아이콘',
    descriptions: '설명', owned: '보유', recommended: '추천', filler: '보충',
    return: '뒤로', backToRun: '런으로 돌아가기', startRun: '런 시작', guide: '가이드', gotIt: '확인',
  },
  zh: {
    setup: '设置', newPlayer: '新手', reset: '重置', resetSure: '确定吗？全部重置',
    collapse: '收起', showTip: '显示提示', tips: '提示', icons: '图标',
    descriptions: '描述', owned: '已拥有', recommended: '推荐', filler: '补充',
    return: '返回', backToRun: '返回本局', startRun: '开始本局', guide: '指南', gotIt: '知道了',
  },
  id: {
    setup: 'Pengaturan', newPlayer: 'Pemain Baru', reset: 'Atur Ulang', resetSure: 'Yakin? Atur ulang semua',
    collapse: 'Ciutkan', showTip: 'Tampilkan tip', tips: 'Tip', icons: 'Ikon',
    descriptions: 'Deskripsi', owned: 'Dimiliki', recommended: 'Direkomendasikan', filler: 'Pengisi',
    return: 'Kembali', backToRun: 'Kembali ke run', startRun: 'Mulai run', guide: 'Panduan', gotIt: 'Mengerti',
  },
  ms: {
    setup: 'Persediaan', newPlayer: 'Pemain Baharu', reset: 'Set Semula', resetSure: 'Pasti? Set semula semua',
    collapse: 'Kuncupkan', showTip: 'Tunjuk petua', tips: 'Petua', icons: 'Ikon',
    descriptions: 'Penerangan', owned: 'Dimiliki', recommended: 'Disyorkan', filler: 'Pengisi',
    return: 'Kembali', backToRun: 'Kembali ke larian', startRun: 'Mula larian', guide: 'Panduan', gotIt: 'Faham',
  },
  vi: {
    setup: 'Thiết lập', newPlayer: 'Người mới', reset: 'Đặt lại', resetSure: 'Chắc chắn? Đặt lại tất cả',
    collapse: 'Thu gọn', showTip: 'Hiện mẹo', tips: 'Mẹo', icons: 'Biểu tượng',
    descriptions: 'Mô tả', owned: 'Đã sở hữu', recommended: 'Đề xuất', filler: 'Bổ sung',
    return: 'Quay lại', backToRun: 'Quay lại lượt chơi', startRun: 'Bắt đầu lượt chơi', guide: 'Hướng dẫn', gotIt: 'Đã hiểu',
  },
  pt: {
    setup: 'Configuração', newPlayer: 'Novo Jogador', reset: 'Redefinir', resetSure: 'Tem certeza? Redefinir tudo',
    collapse: 'Recolher', showTip: 'Mostrar dica', tips: 'Dicas', icons: 'Ícones',
    descriptions: 'Descrições', owned: 'Possuídos', recommended: 'Recomendado', filler: 'Complemento',
    return: 'Voltar', backToRun: 'Voltar à run', startRun: 'Iniciar run', guide: 'Guia', gotIt: 'Entendi',
  },
};

function bt(language: string, key: string, fallback: string): string {
  return BUTTON_TRANSLATIONS[language]?.[key] ?? fallback;
}

/**
 * How each Core is actually played, kukki's own words -- read the moment its
 * bundle opens from the always-visible row, above even the alliance's own
 * name. `pairings`, where given, are the add-on(s) worth reading alongside
 * it closely enough to earn their own full roster in the same bundle, not
 * just a name-drop in the sentence -- only for the Cores where kukki called
 * out one or two alliances specifically; the rest name several in passing
 * without singling any one out for its own roster.
 */
const CORE_TIPS: Record<string, { text: string; pairings?: string[] }> = {
  Yan: {
    text: 'Yan relies on continuously getting units, which would need a lot of funds. Investor, Marvel and Foresight are great pairings for this. Arcane is a good late-game pairing. Consider Damazti Cluster and Arcane Arts Circle on Blaze the Igniting Spark or Yu.',
    pairings: ['Investor', 'Marvel', 'Foresight', 'Arcane'],
  },
  Sargon: {
    text: 'Sargon farms stacks via skill activations especially Philae, Gavial the Invincible and Titi. Precision is naturally triggered from Titi and Passenger, while Swift is extremely popular to boost skill activations.',
    pairings: ['Swift', 'Precision'],
  },
  Victoria: {
    text: 'Victoria wants multiple tiers and items. Getting a variety of units is ideal. Foresight and Marvel are great pairings for Victoria to buy units and items more aggressively. Precision is a good late-game pairing. Consider Damazti Cluster and Precision Scope on Vina Victoria, Horn, Blaze the Igniting Spark and Mint. Agile is a consideration to enjoy higher ATK and higher speed.',
    pairings: ['Foresight', 'Marvel', 'Precision', 'Agile'],
  },
  Laterano: {
    text: 'Laterano relies on exhaustion on ammunition especially with Mostima. Precision can naturally occur in Laterano, while Agile is a consideration to make units exhaust bullets quicker. Durable may be considered for extra health due to the fragility of Laterano units.',
    pairings: ['Precision', 'Agile', 'Durable'],
  },
  'Ægir': {
    text: 'Ægir relies on consumption of others to stack hard. Resilient, Raid and Durable are good add-ons to consider.',
    pairings: ['Resilient', 'Raid', 'Durable'],
  },
  Siracusa: {
    text: 'Siracusa relies on refreshes to stack. Marvel can naturally occur in Siracusa. Once attaining Aroma and Angelina, hunt for free refreshes to stack more. Swift, Raid and Foresight are additional considerations.',
    pairings: ['Marvel', 'Swift', 'Raid', 'Foresight'],
  },
  Kazimierz: {
    text: 'Kazimierz relies on multiple deployments. Raid is almost vital for Kazimierz due to Blemishine and Nearl the Radiant Knight, Resilient is a considerable add-on.',
    pairings: ['Raid', 'Resilient'],
  },
  Kjerag: {
    text: 'Kjerag relies on freezing within range and also obtaining more units. Swift can naturally occur in Kjerag. Agile is a strong consideration for faster freezing. Investor, Foresight, Arcane are additional considerations for the team.',
    pairings: ['Swift', 'Agile', 'Investor', 'Foresight', 'Arcane'],
  },
};

/**
 * Named operators worth the Isomorph badge above their own portrait, keyed
 * by which Core's bundle they should show it in and pointing at which item-
 * alliance the badge should count toward. Read directly off the tips above:
 * Yan's names Blaze the Igniting Spark and Yu for Arcane, Victoria's names
 * Vina Victoria, Horn, Blaze the Igniting Spark and Mint for Precision.
 * Blaze appears in both -- the target depends on which Core's bundle she is
 * being looked at inside, not on her as a fixed fact.
 */
const ISOMORPH_FACE_TARGETS: Record<string, Record<string, string>> = {
  Yan: { 'Blaze the Igniting Spark': 'Arcane', Yu: 'Arcane' },
  Victoria: {
    'Vina Victoria': 'Precision', Horn: 'Precision', 'Blaze the Igniting Spark': 'Precision', Mint: 'Precision',
  },
};

/**
 * What each shop tier shows, and how much of it is advice.
 *
 * Recommended and Otherwise are gone. They split one shelf into "what the guide likes"
 * and "everything else", which asked the player to read two rows to find one operator,
 * and the shop does not deal in that order. One shelf now, cut into a row per tier,
 * with the guide's opinion carried by the faces themselves: greyed means "not yet".
 *
 *   tiers          the tiers this band can show, highest first
 *   greyWhole      tiers entirely behind the run, shown so a late duplicate can still
 *                  be marked, greyed because buying one is not the plan
 *   greyUnadvised  grey anything the guide does not name at this tier
 *   thumbs         whether the guide's thumbs-up is drawn here at all
 *
 * Tier I is deliberately bare: no tier above it, no grey, no thumbs. kukki's reason is
 * that there are no wrong choices that early, and a mark of approval on half the faces
 * invents a decision the round does not have.
 */
interface BandView { tiers: string[]; greyWhole: string[]; greyUnadvised: boolean; thumbs: boolean }
const BAND_VIEW: Record<string, BandView> = {
  I: { tiers: ['I'], greyWhole: [], greyUnadvised: false, thumbs: false },
  II: { tiers: ['II', 'I'], greyWhole: [], greyUnadvised: false, thumbs: true },
  III: { tiers: ['IV', 'III', 'II', 'I'], greyWhole: ['I'], greyUnadvised: true, thumbs: true },
  IV: { tiers: ['V', 'IV', 'III', 'II', 'I'], greyWhole: ['II', 'I'], greyUnadvised: true, thumbs: true },
  V: { tiers: ['VI', 'V', 'IV', 'III', 'II', 'I'], greyWhole: ['III', 'II', 'I'], greyUnadvised: true, thumbs: true },
  VI: { tiers: ['VI', 'V', 'IV', 'III', 'II', 'I'], greyWhole: ['III', 'II', 'I'], greyUnadvised: true, thumbs: true },
};
/**
 * The pool's own glyph, the one the mode's enemy selector draws.
 *
 * This used to be the pool's first creature, on the reasoning that a face is easier to
 * recognise than an abstract mark. It is not, here: the seven marks are what the game
 * itself puts on the screen the player is copying these from, so the mark is the thing
 * they are actually looking for, and the creature was one arbitrary member of fourteen
 * standing in for all of them.
 */
function faceOf(group: StrongholdEnemyGroup) {
  return group.icon ?? null;
}

/**
 * A pool the run drew, on the run screen: the glyph, and under it the pool's
 * name, turning over into what the pool DEMANDS on a hover held for at least
 * a second -- not on a timer any more. A tile nobody is pointing at has
 * nothing new to say, and cycling it anyway asked for a glance at seven
 * tiles that would spend most of their eight seconds showing the one thing
 * already read.
 *
 * Under prefers-reduced-motion nothing turns over on hover either: the need
 * is printed beneath the name instead, always there rather than gated
 * behind a pointer some readers do not have steady enough to hold still for
 * a second.
 */
/**
 * A one-time onboarding hint: dims the whole screen except a target element
 * (a box-shadow "spotlight" -- one box whose shadow covers everything else,
 * rather than a scrim with a cut-out, so there is only one element to
 * position), with an arrow and a short message pointing up at it.
 *
 * The spotlight itself has pointer-events:none, so a press on the lit area
 * reaches the real button underneath -- pressing the highlighted control
 * both acts on it and dismisses the hint in one press, which is the most
 * natural way to close it. A separate full-screen layer catches a press
 * anywhere else for the same dismissal.
 *
 * Measured off the target's own getBoundingClientRect rather than laid out
 * in the flow next to it, since the target can be anywhere in a row whose
 * width changes with the window -- this is the only way to actually point
 * at it rather than approximate where it usually sits.
 */
function OnboardingHint({ targetRef, containerRef, text, onDismiss, zoom, language }: {
  targetRef: React.RefObject<HTMLElement>;
  containerRef: React.RefObject<HTMLElement>;
  text: string;
  onDismiss: () => void;
  zoom: number;
  language: string;
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const el = targetRef.current;
    const view = el?.ownerDocument.defaultView ?? window;
    const measure = () => {
      if (!targetRef.current) return;
      const r = targetRef.current.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    view.addEventListener('resize', measure);
    view.addEventListener('scroll', measure, true);
    return () => {
      view.removeEventListener('resize', measure);
      view.removeEventListener('scroll', measure, true);
    };
  }, [targetRef]);
  if (!rect) return null;
  const view = targetRef.current?.ownerDocument.defaultView ?? window;
  /* Every pixel value below is divided by zoom before it becomes a style,
     since this component renders inside .gm-co's own zoomed subtree and the
     browser will multiply it back by that same zoom on the way to screen --
     rect itself is already the correct, final on-screen position. */
  const z = zoom || 1;
  /* Clamped against the companion's own container, not the browser window --
     on the embedded page ("windowed tab") the companion sits in a narrower
     column than the full window, and the window is wider than the actual
     available space, so a card that fit the window could still run off the
     left edge of the companion itself. The pop-out window doesn't have this
     gap (the window IS the companion), which is why the bug only showed up
     on one of the two. */
  const bounds = containerRef.current?.getBoundingClientRect();
  const boundsLeft = bounds?.left ?? 0;
  const boundsRight = bounds?.right ?? view.innerWidth;
  /* Half the card's own on-screen width (170px nominal, half is 85), scaled
     by zoom -- the card's width is ALSO a length inside the zoomed subtree,
     so its rendered size grows with zoom the same way everything else here
     does, and a margin that didn't scale with it stopped being enough room
     the moment zoom went above 100%. */
  const halfCard = 85 * z;
  const margin = 8;
  /* Below the target by default -- the arrow "drops below" it, per how this
     was asked for. Flips above only if there is not enough room under it
     (the target sitting near the bottom of a short pop-out window), so the
     card is never drawn half off screen. */
  const cardBelow = rect.top + rect.height + 90 < view.innerHeight;
  /* The card's own centre, clamped to the container's bounds -- named once,
     since both the card's own position AND the arrow's offset within it
     depend on where this ends up (they used to be computed separately, which
     is why the arrow stopped following the target the moment the card was
     the one that got clamped). Real (pre-zoom-division) pixels throughout. */
  const cardCenterX = Math.min(
    Math.max(rect.left + rect.width / 2, boundsLeft + margin + halfCard),
    boundsRight - margin - halfCard,
  );
  /* The arrow points at the TARGET, not at the card's own centre -- it used
     to be CSS left:50%, which is only correct when the card happens to be
     centered on the target. Once the card is clamped away from that to stay
     on screen, the arrow has to move independently to keep pointing at the
     actual button: its offset from the card's own (now possibly off-centre)
     left edge, clamped so it never renders past a rounded corner. */
  const targetCenterX = rect.left + rect.width / 2;
  const cardLeftEdge = cardCenterX - halfCard;
  const arrowOffset = Math.min(Math.max(targetCenterX - cardLeftEdge, 14), halfCard * 2 - 14);
  return (
    <div className="gm-co-hintlayer">
      <button type="button" className="gm-co-hintscrim" aria-label="Dismiss hint" onClick={onDismiss} />
      <div
        className="gm-co-hintspot"
        style={{
          left: (rect.left - 4) / z, top: (rect.top - 4) / z, width: (rect.width + 8) / z, height: (rect.height + 8) / z,
        }}
      />
      <div
        className={`gm-co-hintcard${cardBelow ? '' : ' above'}`}
        role="status"
        style={{
          left: cardCenterX / z,
          top: cardBelow ? (rect.top + rect.height + 12) / z : undefined,
          bottom: cardBelow ? undefined : (view.innerHeight - rect.top + 12) / z,
        }}
      >
        <span className="gm-co-hintarrow" aria-hidden="true" style={{ left: arrowOffset / z }} />
        <p>{text}</p>
        <button type="button" onClick={onDismiss}>{bt(language, 'gotIt', 'Got it')}</button>
      </div>
    </div>
  );
}

function DrawnPool({ pool, needs, icon, still }: {
  pool: string; needs: string | null; icon: string | null; still: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [showNeed, setShowNeed] = useState(false);
  useEffect(() => {
    if (still || !needs) return undefined;
    if (!hovering) { setShowNeed(false); return undefined; }
    const t = setTimeout(() => setShowNeed(true), 1000);
    return () => clearTimeout(t);
  }, [hovering, still, needs]);

  const isNeed = !still && showNeed && !!needs;
  const displayName = isNeed ? needs : pool;
  return (
    <div
      className="gm-co-threat on"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      /* Keyboard/touch parity: a tile nobody can hover still gets the
         reminder, just via focus instead of a pointer sitting still. */
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      tabIndex={still ? undefined : 0}
    >
      <Badge name={pool} icon={icon} />
      {/* aria-hidden on the turning line, with the whole thing said once in the label:
          a live region that rewrites itself on every hover is a screen reader
          interrupting the player each time the pointer passes over it. */}
      <span
        className={`gm-co-threatturn${isNeed ? ' need' : ''}`}
        aria-hidden="true"
      >
        {displayName}
      </span>
      {still && needs && <span className="gm-co-needs">{needs}</span>}
      <span className="visually-hidden">{needs ? `${pool}. ${needs}` : pool}</span>
    </div>
  );
}

/**
 * The companion: everything about the run you are in, on one screen, in one look.
 *
 * NOTHING IS CHOSEN ANY MORE. EVERYTHING IS READ. The one thing the player does is tap
 * the operators they get, and the screen works the run out from that, the way the game
 * itself does: an alliance with a marked operator appears in the strip with its count,
 * lights up when the count reaches its activation, bundles its people into a row when
 * it does, and closes the other Cores off when one Core is locked down and manned.
 * The Alliances picker this replaces asked the player to say out loud what the marks
 * already said.
 */
export default function StrongholdCompanion({ data, picker, standalone }: Props) {
  const [pools, setPools] = useState<string[]>([]);
  /**
   * Alliances ruled out for this run, which is the unit a player actually thinks in.
   * Banning operators one at a time produced a wall of chips taller than the screen.
   */
  const [bannedAlliances, setBannedAlliances] = useState<string[]>([]);
  /**
   * Setup is a mode, not a permanent fixture: it takes the whole window, is worked
   * through, and is shut again, and while it is shut the screen is the run.
   *
   * Open from the first frame as a page, because as a page the first frame is
   * server-rendered: starting shut and opening in the launch effect below drew the
   * whole run, un-set-up, and threw it away a frame later. `standalone` is a prop, so
   * the server and the client agree on it and the hydration matches. The launch effect
   * shuts it again if this turns out to be a reload with a run already going. As the
   * pop-out there is nothing to flash. The press opens the window and setup with it.
   */
  const [setupOpen, setSetupOpen] = useState(!!standalone);
  /**
   * New Player mode: a simplified view for someone who does not yet want to
   * shop tier by tier. Drops the Level I-VI band row entirely and narrows
   * the board down to just the star operators of up to three chosen Cores,
   * plus their advised add-ons. A view mode like Setup or the Guide, not a
   * standing preference -- it starts closed and Reset closes it, since it
   * is a way of looking at THIS run rather than a fact about how the player
   * wants the screen dressed forever.
   */
  const [newPlayerMode, setNewPlayerMode] = useState(false);
  const [newPlayerCores, setNewPlayerCores] = useState<string[]>([]);
  /**
   * Which of the three steps setup is on: the pools, the strategy, the bans.
   *
   * One step to a screen rather than three headings down one scroll. The window is a
   * phone-shaped 390px and all three at once is a column nobody reaches the foot of,
   * and a step you have to scroll past is a step you answer without reading.
   */
  const [step, setStep] = useState(0);
  /**
   * Setup has been left, by any door, worked through or skipped.
   *
   * Not derivable from the pools. "Two pools are picked" was standing in for this, and
   * it says the wrong thing about a run that was deliberately skipped: a reload would
   * decide setup had never happened and reopen the wizard over a run in progress,
   * undoing the skip every time the tab came back.
   */
  const [setupDone, setSetupDone] = useState(false);
  /** Tips the player has already acted on, by id. Part of the run: a tip dismissed in
   *  round two should not return in round nine. */
  const [dismissedTips, setDismissedTips] = useState<string[]>([]);
  /** Core alliances whose own strategy tip (CORE_TIPS, and the pairing rosters
   *  that ride under it) has been permanently dismissed -- by alliance name.
   *  Only ever added once that Core has locked in AND the player has since
   *  acted on the board (marked an operator or pressed an alliance chip): the
   *  strategy advice is for BUILDING toward the Core, and once it is locked
   *  and the player is visibly playing it, the tip has nothing left to say. */
  const [dismissedCoreTips, setDismissedCoreTips] = useState<string[]>([]);
  /** Isomorph reminder tips dismissed so far, by alliance -- separate from
   *  dismissedCoreTips since the two tips can be live independently (the
   *  strategy tip retires once locked in; the Isomorph reminder only
   *  appears once locked in, so they are never both live-and-undismissed
   *  at exactly the same moment, but keeping the lists apart avoids
   *  building that assumption into the dismiss logic). */
  const [dismissedIsoTips, setDismissedIsoTips] = useState<string[]>([]);
  /** How many Damazti Isomorph pairs a player has told the screen they have
   *  equipped for a given alliance -- 0 (none, the default) up to 3. Purely
   *  a running tally the player keeps themselves; nothing else in the app
   *  reads it, since there is no way to see an equipped Isomorph from the
   *  board the way a marked operator is visible. */
  const [isomorphCounts, setIsomorphCounts] = useState<Record<string, number>>({});
  /** Which half of the fully-committed view is showing -- Recommended or
   *  Filler, a toggle rather than two stacked blocks now that Filler is
   *  routinely the longer of the two lists. Resets to Recommended whenever
   *  fullyCommitted itself changes, so leaving one Core's fully-committed
   *  view on Filler does not silently carry that choice into the next. */
  const [fillerView, setFillerView] = useState(false);
  /** Which tip is on screen right now, read by toggleGot at the moment of the press.
   *  A ref because the tip is worked out far below where the press is handled. */
  const tipNowRef = useRef<string | null>(null);
  /**
   * The step's heading, which takes focus as the step changes.
   *
   * Next unmounts the button that was pressed, so focus falls to the body and a
   * keyboard is back at the top of the document with three screens of picker between
   * it and the button it just used, and a screen reader is told nothing at all.
   * Moving it to the heading says which step this now is and leaves Back and Next one
   * tab away. Not on the first render: the page opens ON step 1 and stealing focus
   * from a fresh document is the other way to be rude.
   */
  const headRef = useRef<HTMLHeadingElement>(null);
  const stepped = useRef(false);
  useEffect(() => {
    if (!stepped.current) { stepped.current = true; return; }
    headRef.current?.focus();
  }, [step]);
  /** Which alliance the strip is filtered to, or null for all of them. */
  const [filterAlliance, setFilterAlliance] = useState<string | null>(null);
  /**
   * Operators the player has actually got, as a set of names.
   *
   * Names and not counts. What a shopping list needs is one bit (have I got this),
   * and one bit is something a player will keep honest mid-run.
   *
   * This is the run's whole input now. The alliance counts, the strip, the bundles,
   * the lock-downs and everything they rule out are all read off this one list.
   */
  const [got, setGot] = useState<string[]>([]);
  /* Kept across a reload, because a run outlives one and losing a board to a stray
     refresh is worse than any staleness. Reset clears it. */
  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem('gm-co-got');
      if (saved) setGot(JSON.parse(saved) as string[]);
    } catch { /* private mode, or something that is not JSON */ }
  }, []);
  /**
   * What the last mark did, as a sentence for a screen reader.
   *
   * A press on a face answers itself visually, through the got-ring and the strip
   * count, and none of that reaches ears. One polite live region at the top carries
   * the sentence instead. Only toggleGot writes it, so restoring the saved marks on
   * mount stays silent: a reload did not DO anything worth announcing.
   */
  const [markSaid, setMarkSaid] = useState('');

  /** Leave setup and go to the run, from whichever button did it. */
  const leaveSetup = () => {
    setSetupDone(true);
    withShift(() => setSetupOpen(false));
  };

  /** The screen's root, wherever it lives. The pop-out renders in the PiP
   *  window's document, and a view transition has to run on THAT document. */
  const rootRef = useRef<HTMLDivElement>(null);
  /** What each onboarding hint points at. */
  const tipsBtnRef = useRef<HTMLButtonElement>(null);
  const descBtnRef = useRef<HTMLButtonElement>(null);
  /** Whether each one-time onboarding hint has already been shown and
   *  dismissed -- like the other standing preferences, outside gm-co-run and
   *  never touched by Reset, so a hint that has been seen once is seen for
   *  good rather than reappearing every run. */
  const [hintSeen, setHintSeen] = useState({ tips: false, descriptions: false });
  useEffect(() => {
    try {
      setHintSeen({
        tips: window.localStorage?.getItem('gm-co-hint-tips') === '1',
        descriptions: window.localStorage?.getItem('gm-co-hint-desc') === '1',
      });
    } catch { /* private mode: hints simply show every time */ }
  }, []);
  const setHintDismissed = (key: 'tips' | 'descriptions', dismissed: boolean) => {
    setHintSeen((s) => ({ ...s, [key]: dismissed }));
    try {
      window.localStorage?.setItem(
        key === 'tips' ? 'gm-co-hint-tips' : 'gm-co-hint-desc',
        dismissed ? '1' : '0',
      );
    } catch { /* ignore */ }
  };
  const dismissHint = (key: 'tips' | 'descriptions') => setHintDismissed(key, true);
  /**
   * Runs a state change inside a view transition when the browser offers one.
   *
   * One tap here legally restructures the whole screen. A chip lights, a bundle
   * mounts, the tapped row leaves, the list re-sorts, and delivered as an instant
   * cut it reads as chaos. Snapshotting around the change lets the named pieces
   * slide and fade to their new places, so the motion explains what the tap did.
   * flushSync, because the DOM must match the new state before the callback returns.
   * No API or reduced motion asked for: the change lands the way it always has.
   */
  const withShift = (apply: () => void) => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const view = doc.defaultView ?? window;
    const start = (doc as Document & {
      startViewTransition?: (cb: () => void) => ShiftHandle | undefined;
    }).startViewTransition;
    const still = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!start || still) { apply(); return; }
    const shift = start.call(doc, () => { flushSync(apply); });
    if (!shift) return;
    /* A snapshot overlay that never finishes is a still picture of the old screen
       left lying over the live one. The named pieces -- the top bar, the site nav,
       every face -- animate in layers of their own and come out looking right;
       everything else is the root crossfade stopped part way, so the rest of the
       screen sits half faded and stays there. That is what a phone reported after a
       tap on a face, and it does not reproduce in any browser here, so this bounds
       the failure instead of chasing it. skipTransition() is the API for precisely
       this case: it drops the overlay and keeps the new DOM, which is the result a
       browser without the feature gets anyway. 500ms is two and a half times the
       200ms every group animates for, so a merely slow transition still runs to its
       end, and where the overlay behaves this costs one cleared timer. */
    const bail = view.setTimeout(() => shift.skipTransition(), 500);
    /* then(done, done), not finally: `finished` rejects when the update callback
       throws, and a rejection nobody handles is a console error on top of whatever
       actually went wrong. */
    const done = () => view.clearTimeout(bail);
    shift.finished.then(done, done);
  };

  /** Retires whatever tip is on screen right now. The tip asked for a decision,
   *  and marking an operator or pressing an alliance chip both ARE that decision
   *  -- leaving the tip up after either would be the screen repeating advice the
   *  player has visibly acted on. */
  const dismissCurrentTip = useCallback(() => {
    const showing = tipNowRef.current;
    if (showing) setDismissedTips((d) => (d.includes(showing) ? d : [...d, showing]));
  }, []);

  const toggleGot = (name: string) => {
    dismissCurrentTip();
    dismissLockedCoreTips();
    withShift(() => {
      setGot((list) => {
        const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
        try { window.localStorage?.setItem('gm-co-got', JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setMarkSaid(got.includes(name) ? `${name} unmarked` : `${name} marked as got`);
    });
  };

  /** The defence strategy actually taken, by leader name. Chosen once at setup, and
   *  read by STRATEGY_NUDGES for the Strategy lock down tag. */
  const [strategy, setStrategy] = useState<string | null>(null);
  /** The boss this run is building an answer to, by name. Every openable one sits at
   *  round 14, so a run faces exactly one and it is known from the start. */
  const [boss, setBoss] = useState<string | null>(null);
  /**
   * The setup, kept beside the marks it explains.
   *
   * The marks already outlived a reload and the three things that give them meaning
   * did not, so a refresh mid-run handed back a board with no pools, no strategy and
   * no bans, every count intact and nothing to read them against. Launch is what
   * clears a run now, not a reload, so a reload has to bring the whole of it back.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem('gm-co-run');
      if (!saved) return;
      const run = JSON.parse(saved) as {
        pools?: string[]; strategy?: string | null; banned?: string[]; done?: boolean;
        tips?: string[]; boss?: string | null; coreTips?: string[]; isoTips?: string[];
      };
      if (Array.isArray(run.pools)) setPools(run.pools);
      if (Array.isArray(run.banned)) setBannedAlliances(run.banned);
      setStrategy(run.strategy ?? null);
      setBoss(run.boss ?? null);
      setSetupDone(run.done === true);
      if (Array.isArray(run.tips)) setDismissedTips(run.tips);
      if (Array.isArray(run.coreTips)) setDismissedCoreTips(run.coreTips);
      if (Array.isArray(run.isoTips)) setDismissedIsoTips(run.isoTips);
    } catch { /* private mode, or something that is not JSON */ }
  }, []);
  /* Written on change rather than at each place that alters one of the three, so a
     fourth cannot forget to. The first pass is skipped: it fires with the empty state
     of the first render, before the effect above has restored anything, and would
     write that emptiness over the run it is on its way to read. */
  const runSaved = useRef(false);
  useEffect(() => {
    if (!runSaved.current) { runSaved.current = true; return; }
    try {
      window.localStorage?.setItem(
        'gm-co-run',
        JSON.stringify({
          pools, strategy, banned: bannedAlliances, done: setupDone, tips: dismissedTips,
          coreTips: dismissedCoreTips, isoTips: dismissedIsoTips, boss,
        }),
      );
    } catch { /* private mode */ }
  }, [pools, strategy, bannedAlliances, setupDone, dismissedTips, dismissedCoreTips, dismissedIsoTips, boss]);
  /**
   * Reset is armed, waiting for its confirming second press.
   *
   * The button wipes the whole run: marks, bans, pools, strategy, and the storage
   * they live in. It sits in a window that is pressed at speed mid-game, so one
   * stray click must not be enough. Two presses on the same button rather than a
   * modal: the pop-out is small, and a dialog over it would cost more than the
   * mistake it prevents. It disarms by itself after a few seconds, or the moment
   * focus leaves the button.
   */
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarmReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setResetArmed(false);
  }, []);
  /* The disarm timer must not outlive the component. Firing after unmount, which the
     pop-out closing counts as, would be a state update on a dead tree. */
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);
  /* A phone in portrait: the layout is single-column and thumb-sized already,
     so the window opens as the shape it was designed as. */
  const pip = usePipWindow({ width: 390, height: 844 });
  /**
   * How this browser gets its companion, decided AFTER the first render.
   *
   * Reading it during render is a hydration error waiting to happen: the server has no
   * window object, and the two trees would disagree on what the control is.
   *
   *   pip    Document Picture-in-Picture is available: an always-on-top window.
   *   tab    The document API is absent: an ordinary tab, which can be dragged to
   *          another screen but will not stay above the game.
   *   page   A phone or tablet: a second tab beside the game is a tab you cannot see,
   *          so the link opens the companion page in this one.
   */
  const [mode, setMode] = useState<'pip' | 'tab' | 'page'>('pip');

  useEffect(() => {
    if (pip.error) setMode('tab');
  }, [pip.error]);

  /*
   * As close to "just the title bar" as the window can get and still be openable.
   *
   * The bar itself is the browser's. It holds a close button and nothing can be
   * added to it, so a window collapsed to literally that has no way back except
   * dragging its edge, which is a trap. What is left instead is one thin lip beneath
   * it: a chevron, and the alliances the marks say you are building. That is about
   * 24px of content, and the number below is it plus the body's own padding.
   */
  const toggleCollapsed = () => setCollapsed((was) => {
    const next = !was;
    const w = pip.win;
    try {
      if (w) {
        if (next) {
          wasTall.current = w.outerHeight || 0;
          /* Synchronously, inside the click. A pip window's resizeTo spends the
             gesture's transient activation, and a deferred call, such as the
             previous requestAnimationFrame attempt, arrives gestureless and is refused
             (silently, into the catch below), which left the window full-size
             around a one-line strip. So the height is computed, not measured:
             the 24px strip scaled by the size dial, the pip body's 8px padding
             each side, the browser's own title bar as outer-minus-inner, and 2px
             so a rounding slip clips air instead of strip. */
          const chrome = (w.outerHeight || 0) - (w.innerHeight || 0);
          w.resizeTo(w.outerWidth, Math.ceil(24 * zoom + 16 + chrome) + 2);
        } else if (wasTall.current) {
          w.resizeTo(w.outerWidth, wasTall.current);
        }
      }
    } catch {
      /* Some builds refuse to resize a picture-in-picture window. The body still
         collapses, which is most of the point, so this is not worth an error. */
    }
    return next;
  });

  /**
   * Shrunk to a strip, or open.
   *
   * The pop-out's title bar is the browser's and nothing can be put in it, so the
   * control sits at the top of our own content, immediately under it. Collapsing does
   * two things at once: the body stops rendering, and the window is resized down to
   * the strip. Without the second half you would have a mostly empty window still
   * covering the same part of the game, which is the thing being got out of the way.
   */
  const [collapsed, setCollapsed] = useState(false);
  /** The height to come back to, read off the window rather than assumed, because the
   *  player may have dragged it to a size of their own. */
  const wasTall = useRef(0);

  /** Which tier band the shop is showing. The one thing the screen still asks for,
   *  and it is a tap rather than a number: you can see what tier the shop is on.
   *  A band shows everything from the bands below it too. A Tier II shop still
   *  sells Tier I operators, and the Tier I advice does not expire.
   *
   *  Mirrored into the URL as ?band=III so a mid-run address can be shared or
   *  bookmarked and reopen on the same shop. Safe wherever this screen renders:
   *  the pop-out is a portal, and a portal keeps its React context, so the Next
   *  router is there even when the pixels are in another window. Carried as the
   *  tier numeral rather than the index, because the numeral reads as itself in
   *  an address and survives the band list being reordered. */
  const [bandTier, setBandTier] = useQueryState('band', OPENING[0].tier);
  const band = useMemo(() => {
    const i = OPENING.findIndex((b) => b.tier === bandTier);
    /* An address can say ?band=anything, and a numeral the season does not have simply
       means the first band, the same answer a fresh visit gets. */
    return i < 0 ? 0 : i;
  }, [bandTier]);
  const setBand = useCallback((i: number) => setBandTier(OPENING[i].tier), [setBandTier]);
  /* A new band is a new round's question. Whatever bundle was open for the
     last one closes with it, rather than sitting there answering a question
     that has moved on. Not the first render: band starts wherever the URL or
     a resume says it does, and there is nothing open yet to close. */
  const bandMounted = useRef(false);
  useEffect(() => {
    if (!bandMounted.current) { bandMounted.current = true; return; }
    setFilterAlliance(null);
    setOwnedOpen(false);
  }, [band]);

  /** How the mode is played, as opposed to what to buy. A tab rather than a block on
   *  the screen: it is read once and then occasionally re-read. */
  const [guideOpen, setGuideOpen] = useState(false);
  /** The tour of the screen itself, as against the Guide's tour of the mode. */
  /** Which half of the guide is showing. Local to the guide: the Mode toggle that
   *  used to sit in Setup is gone, kukki's call, and the pool picker below simply
   *  allows three, which is the only thing the toggle ever changed. */
  const [guideCoop, setGuideCoop] = useState(false);

  /**
   * Wipe the run: the marks and the storage they live in, the setup that gives them
   * meaning, the tier the shop is on, and any filter left lying over it.
   *
   * One list, called from the three places a run can start: the Reset button, the
   * press that opens the pop-out, and the launch effect below. Three copies of it
   * would drift, and the way that fails is silent. A field nobody remembered to clear
   * carries the last run into the next one and reads there as real.
   */
  const resetRun = useCallback(() => {
    setGot([]);
    setPools([]);
    setStrategy(null);
    setBoss(null);
    setBannedAlliances([]);
    setBand(0);
    setFilterAlliance(null);
    setGuideOpen(false);
    setSetupDone(false);
    setNewPlayerMode(false);
    setNewPlayerCores([]);
    setDismissedTips([]);
    setDismissedCoreTips([]);
    setDismissedIsoTips([]);
    try {
      window.localStorage?.removeItem('gm-co-got');
      window.localStorage?.removeItem('gm-co-run');
    } catch { /* private mode */ }
  }, [setBand]);

  /**
   * A launch starts a clean run. A reload does not.
   *
   * Those are the same wish from opposite ends. Open the companion and it is ready
   * for the run you are about to play, but do not lose the run you are in to a stray
   * refresh. The navigation type is what tells them apart. A new window, or a
   * fresh navigation in from the Stronghold page, reads as `navigate`. The reload a
   * phone performs when you come back to the tab from the game reads as `reload`, and
   * a restored tab as `back_forward`.
   *
   * The session flag is the other half of it, because `reload` alone is not proof of
   * a resume: a bookmark the browser restores reads as one, and a window.open popup is
   * handed a COPY of its opener's session storage, so the flag alone would say
   * "resume" to a window that has never drawn a companion. Both together do mean it.
   * This tab had a companion live in it, and this document is that one coming back.
   *
   * Standalone only. As the button on the Stronghold page this component is not a
   * companion yet, it is a button. The pop-out resets on the press that opens it,
   * which is that flow's launch.
   */
  useEffect(() => {
    if (!standalone) return;
    let live = false;
    /* Private mode reads as a launch every time, which is the safe way round. */
    try { live = window.sessionStorage?.getItem('gm-co-live') === '1'; } catch { /* ignore */ }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resumed = launched || (live && (nav?.type === 'reload' || nav?.type === 'back_forward'));
    launched = true;
    try { window.sessionStorage?.setItem('gm-co-live', '1'); } catch { /* ignore */ }
    if (!resumed) { resetRun(); setStep(0); setSetupOpen(true); return; }
    /* A resume, so the run comes back untouched, and setup, which opened with the
       first frame, gets out of its way. Read from storage rather than from `pools`,
       which the effect that restores it has set but this closure cannot see yet. A run
       with fewer than two pools was never set up, and that one stays on the wizard. */
    let ready = false;
    try {
      const saved = window.localStorage?.getItem('gm-co-run');
      const run = saved ? (JSON.parse(saved) as { pools?: string[]; done?: boolean }) : null;
      /* Skipped counts. A run someone chose not to set up is still a run they are in,
         and reopening the wizard over it on every reload would be the tab arguing
         with them. */
      ready = run?.done === true || (Array.isArray(run?.pools) && run.pools.length >= 2);
    } catch { /* unreadable is not set up */ }
    if (ready) setSetupOpen(false);
  }, [standalone, resetRun]);

  /**
   * How big to draw the whole thing.
   *
   * `zoom` rather than a transform: it reflows, so the rows re-wrap and the six
   * portraits still find a line at any size, where `scale` would shrink a laid-out
   * 420px block and leave it blurred beside its own scrollbar.
   */
  /**
   * Whether the badges drawn OVER a portrait are shown.
   *
   * A face carries up to four of them: the alliance sigils down its right edge, the
   * copier riding its bottom-right corner, the star, and the tier plate. On a roster
   * of eight that is a lot of furniture over the one thing a player
   * recognises anybody by. This hides the two that are additions to the portrait and
   * keeps the two that identify it.
   *
   * Kept, like the zoom: it is how someone likes to read the screen, not part of a run,
   * so it should not need setting again every time the window opens.
   */
  /** Whether the reader has asked for no motion. Read once, here, rather than by each
   *  tile: it is a fact about the reader, not about a pool. */
  const [stillMotion, setStillMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setStillMotion(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  /**
   * The alliance descriptions, on or off.
   *
   * A standing preference like the two beside it, not part of the run, so it lives
   * outside gm-co-run and Reset never touches it. On by default: a reader who has not
   * asked either way is better served knowing what an alliance does, and the switch is
   * there for the one who has read them and now wants the faces back.
   */
  const [descriptions, setDescriptions] = useState(true);
  useEffect(() => {
    try { setDescriptions(window.localStorage?.getItem('gm-co-desc') !== '0'); } catch { /* private mode */ }
  }, []);
  const toggleDescriptions = () => setDescriptions((v) => {
    const next = !v;
    try { window.localStorage?.setItem('gm-co-desc', next ? '1' : '0'); } catch { /* ignore */ }
    setHintDismissed('descriptions', !next);
    return next;
  });

  const [overlays, setOverlays] = useState(true);
  useEffect(() => {
    try { setOverlays(window.localStorage?.getItem('gm-co-overlays') !== '0'); } catch { /* private mode */ }
  }, []);
  const toggleOverlays = () => setOverlays((v) => {
    const next = !v;
    try { window.localStorage?.setItem('gm-co-overlays', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  /**
   * Tips, on or off -- a preference, not part of the run, so it lives outside
   * gm-co-run and Reset never touches it. ON does not change any of the
   * existing dismissal rules; it just lets them keep working the way they
   * already do. OFF overrides all of them at once: no tip of any kind (the
   * top tip bar, a Core's own strategy tip, the Isomorph reminder) is shown,
   * whatever state it would otherwise be in.
   */
  const [tipsEnabled, setTipsEnabled] = useState(true);
  useEffect(() => {
    try { setTipsEnabled(window.localStorage?.getItem('gm-co-tips') !== '0'); } catch { /* private mode */ }
  }, []);
  const toggleTipsEnabled = () => setTipsEnabled((v) => {
    const next = !v;
    try { window.localStorage?.setItem('gm-co-tips', next ? '1' : '0'); } catch { /* ignore */ }
    setHintDismissed('tips', !next);
    return next;
  });

  /** Which language the tip system reads in -- a preference, not part of
   *  the run, same as tipsEnabled/overlays: its own localStorage key, read
   *  after mount, and Reset never touches it. */
  const [language, setLanguage] = useState('en');
  /* Looked up once for the two pickers that show it. Both used to run this find()
     themselves and both printed the full name; the trigger is a code and a chevron
     now, so the name has somewhere else to be -- the accessible name and the
     tooltip, which is where a two-letter code needs it. */
  const currentLanguage = LANGUAGES.find((l) => l.code === language);
  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem('gm-co-lang');
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLanguage(saved);
    } catch { /* private mode */ }
  }, []);
  const chooseLanguage = (code: string) => {
    setLanguage(code);
    try { window.localStorage?.setItem('gm-co-lang', code); } catch { /* ignore */ }
  };
  /** The language picker's own open state -- a small popover off the
   *  Language button, closed by picking a language, pressing Escape, or a
   *  press anywhere else. */
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    if (!langOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLangOpen(false); };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('.gm-co-langbox')) return;
      setLangOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [langOpen]);

  const [zoom, setZoom] = useState(1);
  /**
   * The size the dial calls home: ZOOM_DEFAULT on the companion's own page, 100% in
   * the always-on-top window.
   *
   * State rather than a derived value because it is only knowable on the client, and
   * 100% is the honest thing to render until then -- it is what the server's HTML
   * already says.
   */
  const [zoomHome, setZoomHome] = useState(1);
  /* Read after the first render, never during it: the server has no localStorage and
     a size baked into the server's HTML would not match the client's. */
  useEffect(() => {
    /* Which surface this is, and `standalone` is the whole of it: the companion's own
       page against the button on the Stronghold page, whose copy of the screen is the
       one the PiP draws.
       ?popout=1 used to come into this, back when the only thing that produced it was
       a 390px window.open popup and the flag therefore meant "small". It does not any
       more -- the New tab button opens a full monitor with the same flag on it -- so
       the flag says how much CHROME to draw and nothing at all about size. Reading it
       here would have opened every tab at 100%. */
    const home = standalone ? ZOOM_DEFAULT : 1;
    setZoomHome(home);
    const saved = Number(window.localStorage?.getItem('gm-co-zoom'));
    if (Number.isFinite(saved) && saved >= ZOOM_MIN && saved <= ZOOM_MAX) {
      setZoom(saved);
      return;
    }
    /* Not written to storage: a default the reader never chose should not become a
       saved preference that then follows them onto the surfaces that do not want it. */
    setZoom(home);
  }, [standalone]);
  const sizeBy = (by: number) => setZoom((z) => {
    /* Stepped on a tenth and rounded, or floating point walks the number off the end
       of the readout, as 1.2000000000000002%. */
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + by)) * 10) / 10;
    try { window.localStorage?.setItem('gm-co-zoom', String(next)); } catch { /* private mode */ }
    return next;
  });

  /**
   * The size dial, written once and shown in both screens.
   *
   * It used to live only in the run's toolbar, which meant a reader whose eyes wanted
   * a bigger screen had to answer three setup questions at whatever size they were
   * given before they could ask for one. Setup is also where a first-time reader
   * spends the longest looking at the smallest text on this page.
   *
   * The two placements are mutually exclusive -- setupOpen gates one or the other --
   * so one element is enough. Each site wraps it in its own inverse zoom; see the
   * .gm-co-dialswrap comment for why a control that sizes the screen must not scale
   * with it.
   */
  const sizeDial = (
    <span className="gm-co-size">
      <button
        type="button"
        onClick={() => sizeBy(-0.1)}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Smaller"
      >
        &minus;
      </button>
      {/* The readout is also the way back. Landing on an awkward size and having to
          step out of it one tap at a time is the whole reason a reset exists. */}
      <button
        type="button"
        className="gm-co-sizenow"
        onClick={() => sizeBy(zoomHome - zoom)}
        disabled={zoom === zoomHome}
        title="Back to the default size"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => sizeBy(0.1)}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Bigger"
      >
        +
      </button>
    </span>
  );

  useEffect(() => {
    /* Touch decides before support does: browsers have begun exposing
       documentPictureInPicture on phones without a window worth having, which
       left the button pressable and useless. A hand-held screen has no room
       for a second window anyway, and the pop-out's layout IS a portrait
       phone screen, so on touch the press simply goes to the page. */
    if (window.matchMedia('(pointer: coarse)').matches) { setMode('page'); return; }
    setMode(pipSupported() ? 'pip' : 'tab');
  }, []);

  /**
   * The tab this button opened, so a second press goes to it rather than stacking
   * another.
   *
   * Not just tidiness. The run lives in localStorage, which every tab of the site
   * shares, so two companions open at once are two React states writing the same key
   * over each other. And the name alone will not do it: targeting an open tab by name
   * NAVIGATES it, and a navigation into the companion is a launch -- it would wipe the
   * run the reader is in the middle of, which is the one thing pressing a button
   * labelled "New tab" must not do. Focusing a handle touches nothing.
   */
  const popped = useRef<Window | null>(null);
  const openTab = () => {
    if (popped.current && !popped.current.closed) { popped.current.focus(); return; }
    /* No feature string, and that is the whole difference between a tab and a window:
       any token at all -- even `resizable=yes` -- and the browser opens a popup
       instead.
       ?popout=1 all the same. It is the layout, not the window shape: the site nav,
       the scanbar, the player and the page's own heading step out, and what is left
       is the companion, full-bleed and full-height. That is what the pop-out was for
       and it is what this tab is for -- a surface you are playing beside, not a page
       of the website. The way out is closing the tab, as it was closing the window. */
    popped.current = window.open(`${COMPANION_PAGE}?${COMPANION_POPOUT}`, 'gm-companion');
  };

  /* Keep a phone awake during a run.
     Only on a phone, because that is the screen that locks itself beside the game, and
     only once setup is done: setup is worked through in a minute and the run is the
     part spent reading between waves. Nothing to switch on, and nothing shown when the
     browser has no such API or refuses the lock. */
  useWakeLock(mode === 'page' && !setupOpen);

  /** Solo draws two enemy pools, co-op three. The picker allows the larger and a solo
   *  run simply picks its two. A Mode toggle asked a question the count answers. */
  const poolCap = 3;

  const byName = useMemo(
    () => new Map(data.operators.map((o) => [o.operator, o])),
    [data.operators],
  );
  /**
   * The Owned button beside the tier tabs: press it and the body below shows
   * every operator marked so far, any tier, instead of the current tier's
   * shelf. `ownedSnapshot` is taken at the moment it opens rather than read
   * live off `got` -- unmarking something while the list is open still drops
   * its blue ring right away (opFace reads `got` directly, same as always),
   * but the operator itself stays in view rather than jumping out of the
   * list under the player's finger. The list only drops it on the NEXT
   * open, once it takes a fresh snapshot.
   */
  const [ownedOpen, setOwnedOpen] = useState(false);
  const [ownedSnapshot, setOwnedSnapshot] = useState<string[]>([]);
  const toggleOwned = () => {
    setOwnedOpen((v) => {
      if (!v) setOwnedSnapshot(got);
      return !v;
    });
  };
  const ownedOps = useMemo(
    () => ownedSnapshot.map((n) => byName.get(n)).filter((o): o is StrongholdOperator => !!o),
    [ownedSnapshot, byName],
  );
  /** The shop's items by name, for the Isomorph tip's icons. */
  const itemByName = useMemo(
    () => new Map(data.items.map((i) => [i.name, i])),
    [data.items],
  );
  /** Name plus what the item does, for a badge's tooltip. The icon alone says
   *  which piece of equipment, not why the combo wants it. */
  const itemTitle = (name: string) => {
    const it = itemByName.get(name);
    const effect = it?.base_effect && it.base_effect !== 'None' ? it.base_effect.split('\n')[0] : null;
    return effect ? `${name} — ${effect}` : name;
  };

  /**
   * The pools you drew, and what each one asks of a squad.
   *
   * A readout and nothing more. A pool is drawn rather than chosen, so what it needs
   * is a fact about the fight to hold in mind, not a list to be seen satisfying.
   */
  const threats = useMemo(() => pools.map((group) => {
    const g = data.enemyGroups.find((x) => x.group === group);
    return {
      group,
      pool: poolTail(group),
      icon: g ? faceOf(g) : null,
      needs: POOL_NEEDS[poolTail(group)] ?? null,
    };
  }), [pools, data.enemyGroups]);

  /**
   * An operator is out only when EVERY alliance it belongs to is banned.
   *
   * Banning Kjerag removes exactly one operator, because 71 of the 112 belong to two
   * or three alliances and stay useful to the ones you kept. The length guard matters
   * because `every` on an empty array is true, so an operator with no alliances would
   * otherwise be banned by anything at all.
   */
  const bannedOps = useMemo(() => {
    if (!bannedAlliances.length) return new Set<string>();
    const out = new Set<string>();
    for (const op of data.operators) {
      if (op.alliances.length > 0 && op.alliances.every((a) => bannedAlliances.includes(a))) {
        out.add(op.operator);
      }
    }
    return out;
  }, [data.operators, bannedAlliances]);

  const banned = useMemo(() => [...bannedOps], [bannedOps]);
  const isBanned = useCallback((name: string) => bannedOps.has(name), [bannedOps]);

  const toggleBanAlliance = (a: string) => withShift(() => setBannedAlliances((b) => {
    if (b.includes(a)) return b.filter((x) => x !== a);
    /* The cap is checked here as well as on the button. The button's `disabled` is
       what a player meets. This is what holds if a ban ever arrives from anywhere
       else, a restored run or a future keyboard path, and it is the only place that
       sees the list it is about to grow. */
    const kind = kindOf(a);
    const cap = kind ? BAN_CAP[kind] : undefined;
    if (cap != null && b.filter((x) => kindOf(x) === kind).length >= cap) return b;
    return [...b, a];
  }));

  const kindOf = useCallback(
    (alliance: string) => picker.find((p) => p.alliance === alliance)?.alliance_type,
    [picker],
  );

  /* --- what the marks say ------------------------------------------------------ */

  /**
   * How many DIFFERENT marked operators each alliance has, the number the game
   * itself counts. Marks are a set of names, so distinct falls out for free, and an
   * alter counts separately because the roster lists Lappland and Lappland the
   * Decadenza as two rows, exactly as the game does.
   */
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const name of got) {
      const op = byName.get(name);
      if (!op) continue;
      for (const a of op.alliances) out.set(a, (out.get(a) ?? 0) + 1);
    }
    return out;
  }, [got, byName]);
  /** The marked count, plus whatever Isomorph bonus the player has told the
   *  screen about for that alliance -- an equipped Isomorph pair genuinely
   *  makes a free agent count as a member, so the number shown for the
   *  alliance moves the same way a marked operator moves it, not as a
   *  separate fact sitting next to an unchanged count. */
  const effectiveCount = useCallback(
    (alliance: string) => (counts.get(alliance) ?? 0) + (isomorphCounts[alliance] ?? 0),
    [counts, isomorphCounts],
  );

  const needOf = useCallback(
    (alliance: string) => picker.find((p) => p.alliance === alliance)?.operators_to_activate ?? null,
    [picker],
  );
  /** Enough different operators marked to switch the alliance on. */
  const isActive = useCallback((alliance: string) => {
    const need = needOf(alliance);
    return need != null && (counts.get(alliance) ?? 0) >= need;
  }, [counts, needOf]);

  /**
   * The two marks a face can wear in its top-left corner.
   *
   * A star is a commit unit: buying it is what makes an alliance the run, so it is
   * the single most consequential thing a portrait can tell you. A thumbs-up is the
   * guide's softer yes, a Leaning on a Core or a Good Stacker on an add-on, and
   * the kind has to match the alliance, since Leaning is a Core word and Good
   * Stacker an add-on one. Star wins where both apply: "this decides the run" says
   * more than "this is a good buy".
   *
   * Global rather than per-alliance: the mark answers "is this operator special at
   * all", and the glyph column on the other corner already says for whom.
   */
  const commitUnits = useMemo(
    () => new Set([...lockdownMap().values()].flat()),
    [],
  );
  const praised = useMemo(() => {
    const out = new Set<string>();
    for (const [, entries] of nudgeMap()) {
      for (const e of entries) out.add(e.operator);
    }
    /* Free choice, not tied to any one alliance's note -- so they never earned
       a thumb through the ordinary per-alliance route above. Added directly. */
    out.add('Warfarin');
    out.add('Eyjafjalla the Hvít Aska');
    out.add('Lumen');
    out.add('Yu');
    out.add('Muelsyse');
    return out;
  }, []);

  /** Who locks what down. Computed once, because it is a fact about the guide, not
 *  about the run. */
  const lockdowns = useMemo(() => lockdownMap(), []);
  const goodStackers = useMemo(() => goodStackerMap(), []);


  /** An alliance's badge art, for the glyphs a face wears. */
  const allianceIconOf = useCallback(
    (name: string) => picker.find((p) => p.alliance === name)?.icon ?? null,
    [picker],
  );

  /**
   * Every alliance an operator belongs to, Cores first and then the game's own
   * order, which is the order they are stamped down the face's right edge.
   *
   * Cores lead because a Core is what a run commits to: reading down a face you
   * want "what could this make me" before "what else does it happen to touch".
   * Nobody has more than three (Skadi: Aegir, Durable, Raid), so the column always
   * fits beside the portrait.
   */
  const allianceGlyphs = useCallback((op: StrongholdOperator, within?: string) => {
    const at = (a: string) => picker.findIndex((p) => p.alliance === a);
    return [...op.alliances]
      .filter((a) => at(a) >= 0)
      /* Inside an alliance's own section, that alliance is not news. Every face
         there is a member, which is what the section IS. Dropping it leaves the
         corner saying the only thing it can add: where ELSE this one counts. */
      .filter((a) => a !== within)
      .sort((x, y) => (kindOf(x) === 'Core' ? 0 : 1) - (kindOf(y) === 'Core' ? 0 : 1) || at(x) - at(y));
  }, [picker, kindOf]);

  /** Alliances the squad pays for, which is a decision made before the shop opens.
   *  Chiave grants a Siracusa operator every six refreshes whatever you buy, so a
   *  run under Chiave has its Core decided at round one, and the screen treats it as
   *  locked down from the start rather than waiting for a farmer to say so. */
  const favoured = useMemo(() => nudgeFor(strategy)?.favours ?? [], [strategy]);

  /**
   * Locked down: one of the alliance's lock-down operators is in hand.
   *
   * That is what a lock-down IS: the farmer whose purchase makes the alliance the
   * run. The one exception is a Core no operator locks down (Yan, this season, with
   * Grain Buds demoted to leaning): triggering it on three marked heads is the same
   * statement made with numbers instead.
   */
  const isLockedIn = useCallback((alliance: string) => {
    if (favoured.includes(alliance)) return true;
    const units = lockdowns.get(alliance) ?? [];
    const farmerInHand = units.some((u) => got.includes(u));
    /* An add-on is not somewhere a run commits, as the note further down already
       says about the badge, so a farmer alone cannot switch one on. It
       also has to be carrying the heads the mode asks of it. Without that, a
       single marked operator who happened to be an add-on's lock-down unit put a
       whole bundle on screen for an alliance that was not running, while the
       count chip beside it still read "1 of 2".
       Gated on the mode's own operators_to_activate rather than a flat two:
       Harmony and Solo really do trigger on one head, and Investor wants three. */
    if (kindOf(alliance) !== 'Core') {
      /* An alliance the season added that the guide never described carries no
         threshold to test (alliancesForPicker gives those a null
         operators_to_activate), so there the farmer still speaks for itself, which
         is better than a bundle that can never appear. */
      return farmerInHand && (needOf(alliance) == null || isActive(alliance));
    }
    if (farmerInHand) return true;
    return units.length === 0 && isActive(alliance);
  }, [favoured, lockdowns, got, kindOf, needOf, isActive]);

  /**
   * The alliances this run is visibly building, in the game's own order: active on
   * marked heads, or locked down by a marked farmer. Nothing is chosen. This IS the
   * choosing, read off the board. Banned ones are kept out here and warned about
   * below, so a leftover mark cannot quietly resurrect a ban.
   */
  const building = useMemo(
    () => picker
      .map((p) => p.alliance)
      .filter((a) => !NOT_A_PLAN.has(a))
      .filter((a) => !bannedAlliances.includes(a))
      .filter((a) => isActive(a) || isLockedIn(a)),
    [picker, bannedAlliances, isActive, isLockedIn],
  );
  const buildingSet = useMemo(() => new Set(building), [building]);

  /**
   * A Core that is locked down AND manned (its three heads marked) has settled the
   * run. This is the moment the other Cores close: a lock-down alone still allows
   * switching, and three heads alone still wants its farmer.
   */
  const settled = useMemo(
    () => building.filter((a) => kindOf(a) === 'Core' && isLockedIn(a) && isActive(a)),
    [building, kindOf, isLockedIn, isActive],
  );



  /**
   * Within reach of the tier being looked at.
   *
   * The band's own tier and one above it, because three copies combine into the tier
   * up, so the next one is a plan you can act on today, and everything past it is a
   * plan for a different afternoon. There is no floor: a Tier I is buyable at every
   * Dispatch level there is.
   */
  /**
   * Buyable at the tier being looked at, and no further.
   *
   * This allowed one tier of lookahead, so the Tier I view listed Tier II operators
   * the shop will not offer for several rounds yet. The band buttons are how you
   * look ahead. A section headed Tier I should hold what Tier I can actually buy.
   */
  /**
   * The highest tier worth showing at the current band -- attainability, in one place.
   *
   * Two rules were being applied to the same question in three places. `inReach` was
   * the band's own tier and below, full stop. `freeFaces` had its own `ahead`, the band
   * plus one, at every band including Tier I. And the shelf had a third, gated on
   * LOOKAHEAD_FROM_TIER. So which operators counted as gettable depended on which part
   * of the screen you were reading, and the answer at Tier I was both "not the tier
   * above" and "yes the tier above" at the same time.
   *
   * This is kukki's rule and the shelf's, made the only one: at Tiers I and II the band
   * and below, and from Tier III the band and one above it. The shop is close enough to
   * the next band by then that saving for it is a real plan, and too far from it before
   * then for the tier above to be anything but a list of what you cannot buy.
   */
  const reachCeiling = useMemo(() => {
    const at = data.tiers.indexOf(OPENING[band].tier);
    if (at < 0) return -1;
    const opensAt = data.tiers.indexOf(LOOKAHEAD_FROM_TIER);
    /* Unfindable reads as "always", which is what the shelf's own check did with it. */
    return opensAt < 0 || at >= opensAt ? at + 1 : at;
  }, [band, data.tiers]);

  const inReach = useCallback(
    (op: StrongholdOperator) => reachCeiling < 0
      || data.tiers.indexOf(op.tier) <= reachCeiling,
    [reachCeiling, data.tiers],
  );

  /**
   * Highest tier first, then down. A cumulative Tier III still carries the Tier I
   * picks, and the tiers below are the ones you have already had your chance at, so
   * they sort last.
   *
   * The tier ABOVE used to sort last too, on the reasoning that it is a plan rather
   * than a purchase. That was right while the tier above meant its whole band. Now it
   * means only the starred and thumbed few, and those are the most useful thing in the
   * row, the reason to hold Funds instead of spending them on what is in front of
   * you. Something you are being told to save for cannot be below the things you are
   * being told to save past.
   */
  const tierKey = useCallback((op: StrongholdOperator) => {
    const at = data.tiers.indexOf(OPENING[band].tier);
    const t = data.tiers.indexOf(op.tier);
    if (t === at) return 0;
    if (t < at) return at - t;
    /* Ahead of the band's own tier, not behind it, so the list runs strictly
       downwards: the tier above, then this one, then each tier below it. */
    return -1;
  }, [band, data.tiers]);

  /**
   * Whether an operator feeds anything the marks already feed, meaning any alliance
   * with at least one marked operator, add-ons very much included. A related unit
   * compounds what is on the board. An unrelated one starts over, so it sorts below.
   */

  /**
   * The shopping list, cumulative: this band's picks under everything below it.
   * A Tier III shop still sells Tier I operators and the Tier I advice does not
   * expire, so "which band am I on" stopped being a filter and became a ceiling.
   */
  const merged = useMemo(() => {
    const rows: { op: StrongholdOperator; reasons: OpeningFor[] }[] = [];
    const fallback: StrongholdOperator[] = [];
    const seen = new Set<string>();
    /* `only` is the tier-above filter. The bands at or below this one take everything.
       Every band contributes at all now. Tiers V and VI used to be skipped here,
       carrying a `board` flag meaning "no shopping list", so the row went on
       recommending Tier IV units at Tier VI because there was nothing later to
       merge. The board they draw was never in competition with the list. */
    const take = (i: number, only?: (op: StrongholdOperator) => boolean) => {
      const one = openingFor({ data, band: OPENING[i], chosen: [], banned, bannedAlliances });
      for (const r of one.rows) {
        if (seen.has(r.op.operator)) continue;
        if (only && !only(r.op)) continue;
        seen.add(r.op.operator);
        rows.push(r);
      }
      /* A fallback is "nothing above is on the shelf, take one of these", an answer
         about the tier you are ON. The tier above has no such question. */
      if (only) return;
      for (const f of one.fallback) {
        if (seen.has(f.operator)) continue;
        seen.add(f.operator);
        fallback.push(f);
      }
    };
    for (let i = 0; i <= band; i += 1) take(i);
    /**
     * And the tier above, but only the picks that carry a mark.
     *
     * The whole band would be a shopping list for money you do not have. A starred or
     * thumbed one is different: a star is a farmer that decides the run and a thumb is
     * a pick worth planning around, and both are things to know about BEFORE the shop
     * reaches them. That is the difference between saving for one and being surprised
     * by it. The ceiling already allows the tier, and this is what puts anything
     * there to allow.
     */
    const lookahead = reachCeiling > data.tiers.indexOf(OPENING[band].tier);
    if (lookahead && band + 1 < OPENING.length) {
      take(band + 1, (op) => commitUnits.has(op.operator) || praised.has(op.operator));
    }
    return { rows, fallback };
  }, [data, band, banned, bannedAlliances, commitUnits, praised, reachCeiling]);


  /**
   * kukki's priority order for the list: add-on stackers first, then the operators
   * that feed an add-on AND a Core, then Core-only, then the Fund plays. Within a
   * class the bands' own order survives, because the sort is stable.
   *
   * A pick whose every note is about money or refreshes is a Fund play whatever its
   * alliances say. Silence feeds Foresight, but 'Fund Investment' is the reason she
   * is on the list, and Foresight's stacks are Funds anyway.
   */
  const FUNDISH = useMemo(() => new Set([
    'Fund Investment', 'Funds carry over', 'Costs 1 Fund',
    'Strategic Tier I / V refresh', 'Timed refresh, good to use',
  ]), []);
  const classOf = useCallback((op: StrongholdOperator, reasons?: OpeningFor[]) => {
    if (reasons?.length && reasons.every((r) => FUNDISH.has(r.note))) return 3;
    const kinds = new Set(op.alliances.filter((a) => !NOT_A_PLAN.has(a)).map(kindOf).filter(Boolean));
    const addon = kinds.has('Add-on');
    const core = kinds.has('Core');
    if (addon && core) return 1;
    if (addon) return 0;
    if (core) return 2;
    return 3;
  }, [kindOf, FUNDISH]);

  /**
   * Order that does not move under the cursor.
   *
   * The middle term used to be `related`, whether the operator shares an alliance
   * with something already marked. That reads well in the abstract and is miserable
   * in the hand: marking anyone flipped it true for every operator in
   * that alliance, so the row resorted at the exact moment you were reading it and
   * the face you just pressed jumped to the front, taking its neighbours with it.
   * Half a dozen portraits changing places on every press is the whole row asking
   * to be re-read.
   *
   * What is left depends on nothing you can click. Tier moves when you change
   * band, which you asked for, and class is a fact about the operator. Relevance has
   * not gone anywhere either. Every face now wears its alliances down its right
   * edge, so it is visible in place instead of being sorted for.
   */
  /** Tier IV or better, as COMBO_FROM_TIER says. Guarded against a season whose tier
   *  list does not carry the name, where indexOf would return -1 and pass everything. */
  const comboWorthy = useCallback((op: StrongholdOperator) => {
    const from = data.tiers.indexOf(COMBO_FROM_TIER);
    return from < 0 || data.tiers.indexOf(op.tier) >= from;
  }, [data.tiers]);

  /** All 8 Core alliance names, for the "other cores" greying rules below. */
  const coreNames = useMemo(
    () => picker.filter((p) => p.alliance_type === 'Core').map((p) => p.alliance),
    [picker],
  );
  /**
   * Whether this operator's own star/thumb has gone stale because another
   * Core has since locked in (thumbs) or fully settled (stars) -- the run
   * has moved on, and a mark for a Core that is no longer in play is advice
   * the board itself has already overruled.
   *
   * Thumbs grey out as soon as ANY Core has locked in, unless the operator's
   * own thumb is for one of the locked ones. Stars only grey out once a Core
   * has fully SETTLED (locked and manned), and only for a star that belongs
   * to none of the settled Core -- a star that also happens to feed the
   * settled Core stays lit, since it is still exactly the plan.
   */
  /** FREE_CHOICE and ISOMORPH_CHOICE operators, by name -- worth having
   *  regardless of which Core wins, so they are exempt from the core-lock
   *  greying below wherever they turn up, not only in their own "Helps any
   *  alliance" row. Without this, the same Tier VI free-choice pick read as
   *  full-strength there but greyed the moment the shelf's own VI tab showed
   *  the identical operator -- one fact about them, disagreeing with itself
   *  depending which list happened to be drawing them. */
  const neverGreyed = useMemo(
    () => new Set([...FREE_CHOICE, ...ISOMORPH_CHOICE]),
    [],
  );
  /** Investor greys once some OTHER Core -- not Yan, Kjerag or Kazimierz,
   *  which are Investor's own natural fits -- reaches 5 heads (5/3). Those
   *  three are exempt outright; any other Core hitting that count means the
   *  run has gone somewhere Investor was never going to pay off. */
  const investorGreyed = useMemo(() => {
    const exempt = new Set(['Yan', 'Kjerag', 'Kazimierz']);
    return coreNames.some((c) => !exempt.has(c) && effectiveCount(c) >= 5);
  }, [coreNames, effectiveCount]);
  /** Foresight greys once some Core reaches 6 heads (6/3) without naming
   *  Foresight as one of its own pairings -- the run has settled somewhere
   *  Foresight was never part of the plan for. */
  const foresightGreyed = useMemo(
    () => coreNames.some((c) => effectiveCount(c) >= 6 && !(CORE_TIPS[c]?.pairings ?? []).includes('Foresight')),
    [coreNames, effectiveCount],
  );
  /** Each of the four copiers (Ptilopsis, Saria, Civilight Eterna, Suzuran)
   *  greys once NONE of the alliances the run is actually building -- core
   *  or add-on -- have anyone they can read. A copier with nothing to copy
   *  is not worth having, wherever it happens to be shown. */
  const copierGreyed = useMemo(() => {
    const out = new Set<string>();
    for (const copier of COPIERS) {
      const hasPartner = building.some((allianceName) => data.operators.some(
        (op) => op.alliances.includes(allianceName) && op.operator !== copier.operator && copier.reads(op),
      ));
      if (!hasPartner) out.add(copier.operator);
    }
    return out;
  }, [building, data.operators]);
  const isGreyedByCoreLock = useCallback((op: StrongholdOperator) => {
    if (neverGreyed.has(op.operator)) return false;
    if (investorGreyed && op.alliances.includes('Investor')) return true;
    if (foresightGreyed && op.alliances.includes('Foresight')) return true;
    if (copierGreyed.has(op.operator)) return true;
    const lockedCoreNames = coreNames.filter((c) => isLockedIn(c));
    /* A member of a locked Core is exempt outright, whatever else they might
       nominally help. Once committed, that Core's own operators ARE the
       plan -- Blaze also naming Yan does not make her less worth having once
       Sargon is the run, if Blaze herself is a Sargon operator. */
    if (lockedCoreNames.some((c) => op.alliances.includes(c))) return false;
    const settledCore = settled[0];
    if (settledCore) {
      const starCores = coreNames.filter((c) => (lockdowns.get(c) ?? []).includes(op.operator));
      if (starCores.length > 0 && !starCores.includes(settledCore)) return true;
    }
    if (lockedCoreNames.length > 0) {
      const thumbCores = coreNames.filter((c) => (goodStackers.get(c) ?? []).includes(op.operator));
      if (thumbCores.length > 0 && thumbCores.every((c) => !lockedCoreNames.includes(c))) return true;
    }
    return false;
  }, [
    neverGreyed, investorGreyed, foresightGreyed, copierGreyed,
    settled, coreNames, lockdowns, isLockedIn, goodStackers,
  ]);

  /** Star, then thumb, then unmarked, the same order the two glyphs already imply,
   *  and the same tie-break the face itself uses when an operator has earned both. */
  const markKey = useCallback(
    (op: StrongholdOperator) => (commitUnits.has(op.operator) ? 0 : praised.has(op.operator) ? 1 : 2),
    [commitUnits, praised],
  );
  const listed = useMemo(
    () => [...merged.rows].sort((a, b) => tierKey(a.op) - tierKey(b.op)
      /* Above class, not below it: the mark is the guide's own emphasis on a single
         operator, where the class is a fact about which alliances it happens to feed.
         Sorting by class first buried every star behind whichever add-on stackers
         shared its tier. */
      || markKey(a.op) - markKey(b.op)
      || classOf(a.op, a.reasons) - classOf(b.op, b.reasons)),
    [merged.rows, tierKey, markKey, classOf],
  );



  /* --- renderers ----------------------------------------------------------------- */

  /**
   * A portrait you can press, wherever one appears.
   *
   * The click is stopped from propagating because several of these sit inside a row
   * that is itself a button, and pressing the face should mark the face.
   *
   * `coreLink` names a locked-down Core the operator ALSO belongs to, when the face
   * is drawn in some other alliance's roster: it counts for two at once, so it gets
   * an amber bang and full visibility instead of the roster's not-got dimming.
   *
   * The aria-label says everything the tooltip says: the portrait itself is
   * aria-hidden decoration, so without a label the only text inside the button is
   * the tier numeral and a screen reader announces every face as "II".
   */
  /**
   * The operator's own effect text, with the promoted values folded in.
   *
   * Three things the source data does that a naive join gets wrong:
   *
   * 1. It repeats itself. Executor's base_attribute states the same effect twice
   *    in slightly different words, and so does its promoted form, so printing
   *    both of both gave four copies of one sentence. A line is dropped when it
   *    shares 70% of its words with an earlier one, numbers normalised out. The
   *    threshold is not arbitrary: the restatements sit at 72-92% overlap
   *    (Executor 72, Meteor 86, Nearl 92) and the genuinely separate effects at
   *    58% and below (Degenbrecher 58, Gravel 50, Lappland 38, Pinecone 31).
   *    Those ARE different effects. Gravel's two lines are On deployment and
   *    When defeated, so collapsing everything would lose real information.
   *
   * 2. Base and promoted differ by a number, not a sentence. They are aligned by
   *    longest common subsequence and only the differing runs are merged, so
   *    "gains +1 ASPD" and "gains +2 ASPD" become "gains +1/+2 ASPD" rather than
   *    two lines. Where a run differs in prose the base wording is kept, because
   *    the alternative is a sentence neither form actually says.
   *
   * 3. A changed number often drags a plural with it: "+1 stack" against "+2
   *    stacks" differs in two places, and a single-token rule silently printed
   *    the base alone. Equal-length runs zip, numbers pairing up and a word that
   *    is just the other pluralised taking the plural.
   */
  const traitOf = useCallback((op: StrongholdOperator) => {
    const base = (op.base_attribute ?? '').trim();
    const prom = (op.promoted_attribute ?? '').trim();
    if (!base) return prom;
    if (!prom || prom === base) return base;
    const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
    const key = (t: string) => t.toLowerCase().replace(/[0-9]+/g, '#').replace(/[^a-z#[\] ]/g, '').split(/\s+/).filter(Boolean);
    const overlap = (x: string, y: string) => {
      const A = new Set(key(x)); const B = new Set(key(y));
      return [...A].filter((t) => B.has(t)).length / Math.max(A.size, B.size, 1);
    };
    const numeric = (t: string) => /\d/.test(t);
    const mergeLine = (x: string, y: string) => {
      const A = x.split(' '); const B = y.split(' ');
      const m = A.length; const n = B.length;
      const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = m - 1; i >= 0; i -= 1) {
        for (let j = n - 1; j >= 0; j -= 1) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
      const out: string[] = []; let i = 0; let j = 0; let da: string[] = []; let db: string[] = [];
      const flush = () => {
        if (!da.length && !db.length) return;
        if (da.length === db.length && da.length > 1) {
          out.push(da.map((t, k) => {
            const u = db[k];
            if (t === u) return t;
            if (numeric(t) && numeric(u)) return `${t}/${u}`;
            return u === `${t}s` ? u : t;
          }).join(' '));
        } else if (da.length === 1 && db.length === 1 && numeric(da[0]) && numeric(db[0])) {
          const tail = /[^A-Za-z0-9%]+$/.exec(da[0])?.[0] ?? '';
          out.push(tail && db[0].endsWith(tail)
            ? `${da[0].slice(0, -tail.length)}/${db[0].slice(0, -tail.length)}${tail}`
            : `${da[0]}/${db[0]}`);
        } else {
          out.push(da.join(' '));
        }
        da = []; db = [];
      };
      while (i < m && j < n) {
        if (A[i] === B[j]) { flush(); out.push(A[i]); i += 1; j += 1; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { da.push(A[i]); i += 1; }
        else { db.push(B[j]); j += 1; }
      }
      while (i < m) { da.push(A[i]); i += 1; }
      while (j < n) { db.push(B[j]); j += 1; }
      flush();
      return out.filter(Boolean).join(' ');
    };
    const bl = lines(base); const pl = lines(prom);
    const keptRaw: string[] = []; const out: string[] = [];
    bl.forEach((l, i) => {
      /* Raw against raw, not against what has already been merged: once a line
         carries "+7/+14" its numbers normalise differently from the "+7" of the
         line restating it, and the overlap drops below the threshold exactly
         where it is needed. */
      if (keptRaw.some((k) => overlap(k, l) >= 0.7)) return;
      keptRaw.push(l);
      out.push(pl[i] ? mergeLine(l, pl[i]) : l);
    });
    return out.join('\n');
  }, []);

  /**
   * The interactive Isomorph badge for a given alliance -- Damazti Isomorph +
   * whatever item that alliance pairs with, click to activate (x1), the
   * counter that grows out of it to raise it further (x2, x3), the badge
   * itself (not the counter) to remove it. Pulled out to its own function
   * because it now renders in three places: the alliance's own header, and
   * both directions of the pairing rosters (a Core showing its add-on
   * pairings, and an add-on showing which Cores pair with it) -- the same
   * fact about the alliance, wherever its name is printed.
   */
  const isomorphBadge = (allianceName: string, showCounter = true) => {
    if (!ISOMORPH_ITEM[allianceName]) return null;
    const isoCount = isomorphCounts[allianceName] ?? 0;
    return (
      <span
        className={`gm-co-labeliso${isoCount > 0 ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        title={isoCount > 0
          ? `${isoCount} Damazti Isomorph pair${isoCount > 1 ? 's' : ''} equipped — click to remove`
          : `Damazti Isomorph + ${ISOMORPH_ITEM[allianceName]} — click to mark one equipped`}
        onClick={() => {
          setIsomorphCounts((c) => ({ ...c, [allianceName]: c[allianceName] ? 0 : 1 }));
          dismissLockedCoreTips();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsomorphCounts((c) => ({ ...c, [allianceName]: c[allianceName] ? 0 : 1 }));
            dismissLockedCoreTips();
          }
        }}
      >
        <span className="gm-co-isoitem" role="img" aria-label="Damazti Isomorph">
          <Badge name="Damazti Isomorph" icon={itemByName.get('Damazti Isomorph')?.icon ?? null} />
        </span>
        <b className="gm-co-plus" aria-hidden="true">+</b>
        <span className="gm-co-isoitem" role="img" aria-label={ISOMORPH_ITEM[allianceName]}>
          <Badge name={ISOMORPH_ITEM[allianceName]} icon={itemByName.get(ISOMORPH_ITEM[allianceName])?.icon ?? null} />
        </span>
        {showCounter && isoCount > 0 && (
          <button
            type="button"
            className="gm-co-isocount"
            onClick={(e) => {
              e.stopPropagation();
              setIsomorphCounts((c) => ({ ...c, [allianceName]: Math.min(3, (c[allianceName] ?? 1) + 1) }));
            }}
            title="One more Isomorph pair equipped (maximum x3)"
          >
            x{isoCount}
          </button>
        )}
      </span>
    );
  };

  const opFace = (op: StrongholdOperator, extra = '', coreLink?: string, within?: string, pairedWith?: { op: StrongholdOperator; why: string }, isomorphTarget?: string) => {
    const mine = got.includes(op.operator);
    /* One corner, one marker, and now only ever the committed Core's badge.
       Good Stackers used to wear a "!" here, which asked the reader to know
       what a bang on a portrait meant and then find them by scanning every
       roster. The shelf can say so in a word instead. */
    const showBadge = !!coreLink;
    const face = (
      <button
        key={isomorphTarget ? undefined : op.operator}
        type="button"
        className={`gm-co-actwho gm-co-face${mine ? ' got' : ''}${coreLink ? ' gm-co-corelink' : ''}${extra ? ` ${extra}` : ''}`}
        aria-pressed={mine}
        aria-label={`${op.operator}, Tier ${op.tier}, ${allianceGlyphs(op, within).join(' and ') || 'no alliance'}${commitUnits.has(op.operator) ? ', commit unit' : praised.has(op.operator) ? ', recommended' : ''}${pairedWith ? `, copied by ${pairedWith.op.operator}` : ''}${coreLink ? `, feeding the committed core ${coreLink}` : ''}${mine ? ', got' : ''}${traitOf(op) ? `. ${traitOf(op).replace(/\n/g, '. ')}` : ''}`}
        onClick={(e) => { e.stopPropagation(); toggleGot(op.operator); }}
        /* The trait, not a restatement of the portrait. Name, tier, alliances and
           marks are all already ON the face, so the hover was reading them back,
           and the one thing a portrait cannot show is what the operator DOES.
           Falls back to the old summary for the five with no effect text. The
           aria-label below keeps the full description: a screen reader has none
           of the visual context this tooltip is free to assume. */
        title={traitOf(op)
          || `${op.operator} · Tier ${op.tier}${allianceGlyphs(op, within).length ? ` · ${allianceGlyphs(op, within).join(' · ')}` : ''}`}
      >
        <Badge name={op.operator} icon={op.icon} />
        <i className="gm-co-acttier">{op.tier}</i>
        {/* Top-left, opposite the alliance glyphs. Star beats thumbs-up where both
            apply: "this decides the run" says more than "this is a good buy". Both
            aria-hidden, because the label below spells them out and an unnamed glyph is
            a riddle to a screen reader. */}
        {(commitUnits.has(op.operator) || praised.has(op.operator)) && (
          <span
            className={`gm-co-facemark ${commitUnits.has(op.operator) ? 'gm-co-star' : 'gm-co-praise'}`}
            aria-hidden="true"
          >
            {commitUnits.has(op.operator) ? (
              <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
                <path d="M6 0.6 7.6 4.1 11.4 4.5 8.6 7.1 9.4 10.9 6 9 2.6 10.9 3.4 7.1 0.6 4.5 4.4 4.1Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
                <path d="M3.2 5.1 5.2 0.8c0.9-0.1 1.4 0.4 1.3 1.2L6.1 4.2h3.2c0.7 0 1.2 0.6 1 1.3l-1 3.6c-0.1 0.6-0.7 1-1.3 1H3.2Z" />
                <rect x="0.6" y="5.1" width="1.9" height="5" rx="0.4" />
              </svg>
            )}
          </span>
        )}
        {/* Down the right edge, Cores first. Said in the label and the tooltip too,
            since the glyphs are aria-hidden and a screen reader reading three
            unnamed images is worse than the sentence they stand for. The one that
            feeds a committed Core keeps its ring, which is the only thing this
            corner used to say and is still worth saying louder than the rest. */}
        {overlays && (
        <span className="gm-co-facealls" aria-hidden="true">
          {allianceGlyphs(op, within).map((a) => (
            <span key={a} className={`gm-co-faceall${showBadge && a === coreLink ? ' lit' : ''}`}>
              <Badge name={a} icon={allianceIconOf(a)} />
            </span>
          ))}
        </span>
        )}
      </button>
    );
    /* The Isomorph pairing, above the face rather than beside it -- named
       operators worth putting the item on, so the badge that raises the
       target alliance's count sits right where the player is already
       looking, rather than needing a trip back to that alliance's own
       header to do the same thing. */
    if (!isomorphTarget) return face;
    return (
      <span key={op.operator} className="gm-co-facewithiso">
        {isomorphBadge(isomorphTarget, false)}
        {face}
      </span>
    );
  };

  /**
   * One alliance chip, wherever it is drawn: the dynamic strip below (only the
   * alliances the marks have reached) and the always-visible Core row above it
   * (all 8, whether or not anything is marked yet) are the same button reading
   * a different list, not two different buttons -- so a Core chip behaves
   * identically whichever row it happens to be sitting in.
   */
  /* `quiet` is required rather than defaulted on purpose: there are two call sites,
     the Core row and the alliance strip, and a chip drawn at the wrong strength is
     exactly the kind of wrong answer nothing here would report. Making the compiler
     ask both is cheaper than finding it on screen. */
  const allyChip = (p: Picked, quiet: boolean) => {
    const n = effectiveCount(p.alliance);
    const lit = isActive(p.alliance);
    const out = bannedAlliances.includes(p.alliance);
    /* A banned Core is worth shouting about: it is the run's whole direction,
       and the marks feeding it are wasted. A banned add-on is not. You never
       needed that many, dropping one costs the run little, and a strip of red
       for something this ordinary buries the Core that does matter. Both still
       say "banned" to a screen reader, and only the colour is rationed. */
    const outCore = out && kindOf(p.alliance) === 'Core';
    const isCoreType = kindOf(p.alliance) === 'Core';
    /* A strategy-favoured Core counts alongside an actually locked-in one
       here -- the starting buff already committed the run to it, so the
       other Cores should read as settled history and its own add-ons as
       advised the same way they would once a real star lands. */
    const lockedCoreNames = coreAlliances
      .filter((c) => isLockedIn(c.alliance) || favoured.includes(c.alliance))
      .map((c) => c.alliance);
    /* Once some Core has locked in, every OTHER Core reads as settled history
       rather than an open question -- dimmed the same way a stale star/thumb
       is dimmed elsewhere, not hidden. The locked one itself is never dimmed
       by this (isLockedIn(p.alliance) excludes it), whatever else is true of
       it. */
    const dimmed = isCoreType && !isLockedIn(p.alliance) && lockedCoreNames.length > 0;
    /* An add-on a locked Core actually names as a pairing -- worth a different
       colour than an ordinary add-on the run has simply reached, since one is
       advice and the other is just a fact about what has been marked. */
    const advised = !isCoreType && lockedCoreNames.some((core) => (CORE_TIPS[core]?.pairings ?? []).includes(p.alliance));
    const filled = p.operators_to_activate != null && n >= p.operators_to_activate;
    /* Yellow/green for an advised add-on (incomplete/filled), green for a
       filled Core, blue for a filled ordinary add-on, nothing for an
       ordinary add-on still short of its count -- greyed instead, alongside
       whichever other chips are already dimmed for this run. */
    let status = '';
    if (isCoreType) { if (filled) status = 'status-green'; } else if (advised) {
      status = filled ? 'status-green' : 'status-yellow';
    } else if (filled) { status = 'status-blue'; }
    const greyed = !isCoreType && !advised && !filled;
    const picked = newPlayerMode && newPlayerCores.includes(p.alliance);
    const only = !newPlayerMode && filterAlliance === p.alliance;
    const said = [
      `${p.alliance} · ${n}${p.operators_to_activate != null ? ` of ${p.operators_to_activate}` : ''}`,
      lit ? 'active' : null,
      isLockedIn(p.alliance) ? 'committed' : null,
      advised ? 'advised add-on' : null,
      out ? 'banned' : null,
    ].filter(Boolean).join(' · ');
    return (
      <button
        key={p.alliance}
        type="button"
        className={`gm-co-ally${lit ? ' lit' : ''}${outCore ? ' out' : ''}${out && !outCore ? ' out-soft' : ''}${only ? ' only' : ''}${quiet ? ' quiet' : ''}${dimmed || greyed ? ' dimmed' : ''}${picked ? ' picked' : ''}${status ? ` ${status}` : ''}`}
        aria-pressed={newPlayerMode ? picked : only}
        aria-label={`${said}${only ? ' · showing only this' : ''}${picked ? ' · picked' : ''}`}
        title={newPlayerMode
          ? (picked ? `${p.alliance} — press to un-pick` : `${p.alliance} — press to pick (up to three)`)
          : `${said}${only ? ' · showing only this — press to show all' : ' · press to show only this'}`}
        onClick={() => withShift(() => {
          if (newPlayerMode) {
            /* Cores only -- an add-on chip does nothing here, same as the tier
               band row is simply absent. Up to three: a fourth press is ignored
               rather than silently bumping one of the first three out, since a
               swap the player did not ask for is a worse surprise than a
               press that visibly does nothing. */
            if (kindOf(p.alliance) !== 'Core') return;
            setNewPlayerCores((cur) => {
              if (cur.includes(p.alliance)) return cur.filter((a) => a !== p.alliance);
              if (cur.length >= 3) return cur;
              return [...cur, p.alliance];
            });
            return;
          }
          setFilterAlliance((cur) => (cur === p.alliance ? null : p.alliance));
          dismissCurrentTip();
          dismissLockedCoreTips();
        })}
      >
        <Badge name={p.alliance} icon={p.icon} />
        {/* n of what it takes, not a bare n. The count alone made you remember
            each alliance's threshold to know whether it meant anything, and
            they are not uniform. Most add-ons want two, Harmony and Solo one,
            the Cores and Investor three. */}
        <b>{n}{p.operators_to_activate != null ? `/${p.operators_to_activate}` : ''}</b>
      </button>
    );
  };



  /** The alliances a marked farmer has locked down, and whether any of them is a
   *  Core, which gates the free-choice and Isomorph tips. */
  const lockedIn = useMemo(
    () => building.filter((a) => isLockedIn(a)),
    [building, isLockedIn],
  );
  /**
   * Whichever happens first, per each hint's own two conditions -- a band
   * threshold, or a run-state fact that can arrive earlier than that band
   * does. `settled` (a Core locked AND manned, 3 units) is the "locked down
   * a core alliance" half of the Tips hint; `lockedIn.length` (any star
   * picked at all) is the "chosen a star operator" half of the Descriptions
   * one. Only one hint shows at a time -- Descriptions takes priority if
   * both are somehow due on the same render, since Level IV arrives before
   * Level V does. */
  const tipsHintDue = !hintSeen.tips && (band >= 4 || settled.length > 0);
  const descHintDue = !hintSeen.descriptions && (band >= 3 || lockedIn.length > 0);
  const activeHint: 'tips' | 'descriptions' | null = descHintDue ? 'descriptions' : (tipsHintDue ? 'tips' : null);
  /**
   * The bosses a run can be dealt. All seven sit at round 14, so this is a list of
   * seven and the run meets exactly one of them. The hidden three are round 15 and
   * stay behind the spoiler gate on the Stronghold page, not here.
   */
  const bossChoices = useMemo(() => data.bosses.filter((b) => !b.hidden), [data.bosses]);
  const bossNow = useMemo(
    () => bossChoices.find((b) => b.name === boss) ?? null,
    [bossChoices, boss],
  );

  /** How this band draws its shelf. */
  const view = BAND_VIEW[OPENING[band].tier] ?? BAND_VIEW.I;
  /** Which tier row the square buttons are showing. Reset to the band's own tier
   *  every time the band changes -- a pick made while browsing Tier III (say,
   *  "show me II") is still a *valid* tier once the shop reaches Tier IV, so the
   *  old "still valid" guard alone let it silently keep showing Tier II instead
   *  of snapping forward to what the new band actually deals. */
  const [tierPick, setTierPick] = useState<string | null>(null);
  useEffect(() => { setTierPick(null); }, [band]);
  const shownTier = tierPick && view.tiers.includes(tierPick) ? tierPick : OPENING[band].tier;
  /** Everything the guide names at all, at any tier, which is what "advised" means. */
  const advised = useMemo(
    () => new Set(listed.map((r) => r.op.operator)),
    [listed],
  );
  /**
   * The shelf: every operator of the shown tier, the guide's picks first.
   *
   * Everything, not a selection. The shop deals what it deals, and a player who is
   * handed a unit the guide never mentions still has to be able to mark it. What the
   * guide thinks is said by the face: full strength for a pick, greyed for one that is
   * behind the run or that the guide does not name yet.
   */
  const shelf = useMemo(() => data.operators
    .filter((op) => op.tier === shownTier && !isBanned(op.operator))
    .sort((a, b) => (isGreyedByCoreLock(a) ? 1 : 0) - (isGreyedByCoreLock(b) ? 1 : 0)
      || markKey(a) - markKey(b) || byTier(a, b)),
  [data.operators, shownTier, isBanned, markKey, isGreyedByCoreLock]);
  /** Behind the run, or not yet advised. Greyed, never hidden. */
  const unadvised = useCallback((op: StrongholdOperator) => (
    !neverGreyed.has(op.operator) && !commitUnits.has(op.operator) && !praised.has(op.operator) && (
      view.greyWhole.includes(op.tier)
      || (view.greyUnadvised && !advised.has(op.operator))
    )
  ), [view, advised, neverGreyed, commitUnits, praised]);

  /** The first milestone past base activation -- 5 for Ægir, 6 for everyone
   *  else (Yan's own second milestone is also 6; its third, at 9, is a
   *  further one this does not reach for). This is the point the Isomorph
   *  reminder tip below fires at, not the highest milestone fullyCommitted
   *  reads -- the two are different questions read off the same list. */
  const secondMilestone = useCallback((core: string) => {
    /* Ægir's own confirmed number -- the regex-derived milestones list was not
       resolving to 5 the way expected (it was triggering at the same 5/3 as
       every other Core), so this is trusted directly instead of chasing why. */
    if (core === 'Ægir') return 5;
    const milestones = data.alliances.find((x) => x.alliance === core)?.milestones ?? [];
    return milestones.length > 1 ? milestones[1] : 6;
  }, [data.alliances]);
  /**
   * Fully committed: the locked Core has reached its OWN highest milestone
   * (read off the alliance's own effect text, same as everywhere else this
   * app reads a milestone -- 6 for most Cores, 5 for Ægir, and Yan's third
   * milestone at 9 is still its highest). Past that point the question the
   * tier tabs answer -- "which tier am I shopping at" -- has nothing left to
   * add: the run is exactly this Core now, and what is worth knowing is
   * simply everyone still worth having, at any tier, in one look.
   */
  const fullyCommitted = useMemo(() => {
    if (!settled.length) return false;
    const core = settled[0];
    const milestones = data.alliances.find((x) => x.alliance === core)?.milestones ?? [];
    const need = milestones.length ? Math.max(...milestones) : 6;
    return effectiveCount(core) >= need;
  }, [settled, data.alliances, effectiveCount]);
  useEffect(() => { setFillerView(false); }, [fullyCommitted]);
  /**
   * Below the floor Recommended will still name at this band -- by Tier V the
   * low tiers are spent, and naming a Tier I/II pick there is the same
   * mistake RECOMMEND_FLOOR used to fix for the old cumulative list. The
   * floor rises with the band: Tier III at Tier V, Tier IV at Tier VI. The
   * Tier VI floor has an exception the Tier V one does not: a member of the
   * locked Core, or a free-choice pick, is still worth naming whatever tier
   * they happen to be -- the tier is not the reason either one is on the
   * list.
   */
  const belowRecommendFloor = useCallback((op: StrongholdOperator) => {
    const at = data.tiers.indexOf(op.tier);
    if (band === 4) return at < data.tiers.indexOf('III');
    if (band === 5) {
      if (at >= data.tiers.indexOf('IV')) return false;
      if (neverGreyed.has(op.operator)) return false;
      const settledCore = settled[0];
      if (settledCore && op.alliances.includes(settledCore)) return false;
      return true;
    }
    return false;
  }, [band, data.tiers, neverGreyed, settled]);
  /** Every tier at once, the guide's picks first within each, with anything
   *  greyed (behind the run, or stale from another Core's lock) or below the
   *  band's own floor dropped to Filler instead -- a fully committed run has
   *  no more use for "not the plan", only for "still worth having". */
  /** Worth naming in Recommended at all: a star, a thumb, or a free-choice
   *  pick. Not-greyed alone let a plain operator with no tie to the settled
   *  Core -- or to anything -- through by default, since isGreyedByCoreLock
   *  only ever disqualifies, it never requires a reason to belong. */
  /** Cuora keeps her thumb (Good Stacker for Durable) everywhere else, but is
   *  explicitly excluded from Recommended -- always Filler instead, whatever
   *  her mark says. */
  const isRecommendable = useCallback(
    (op: StrongholdOperator) => op.operator !== 'Cuora'
      && (neverGreyed.has(op.operator) || commitUnits.has(op.operator) || praised.has(op.operator)),
    [neverGreyed, commitUnits, praised],
  );
  /** Highest tier first (VI down to I) -- the reverse of byTier's own I-first
   *  order, used wherever "more advanced" should read as "closer to the
   *  front" rather than "closer to the shop's own starting point". */
  const byTierDesc = useCallback(
    (a: StrongholdOperator, b: StrongholdOperator) => data.tiers.indexOf(b.tier) - data.tiers.indexOf(a.tier),
    [data.tiers],
  );
  const massShelfRecommended = useMemo(() => {
    if (!fullyCommitted) return [] as StrongholdOperator[];
    return data.operators
      .filter((op) => !isBanned(op.operator) && !isGreyedByCoreLock(op) && !belowRecommendFloor(op) && isRecommendable(op))
      .sort((a, b) => markKey(a) - markKey(b) || byTierDesc(a, b));
  }, [fullyCommitted, data.operators, isBanned, isGreyedByCoreLock, belowRecommendFloor, isRecommendable, markKey, byTierDesc]);
  /** The collage: everyone Recommended would otherwise have dropped, kept
   *  visible under its own heading instead of vanishing. Tier alone, highest
   *  first -- no mark-based grouping here, since Filler is exactly the
   *  operators the mark system already had nothing more to say about. */
  const massShelfFiller = useMemo(() => {
    if (!fullyCommitted) return [] as StrongholdOperator[];
    return data.operators
      .filter((op) => !isBanned(op.operator)
        && (isGreyedByCoreLock(op) || belowRecommendFloor(op) || !isRecommendable(op)))
      .sort(byTierDesc);
  }, [fullyCommitted, data.operators, isBanned, isGreyedByCoreLock, belowRecommendFloor, isRecommendable, byTierDesc]);

  /** Just the locked Cores: the Isomorph tip is per-Core, and the add-on rosters
   *  flag members who double as one of these (see opFace's coreLink). */
  const lockedCores = useMemo(
    () => lockedIn.filter((a) => kindOf(a) === 'Core'),
    [lockedIn, kindOf],
  );
  /**
   * The operators whose value does not hang on an alliance: the free agents and the
   * three an Isomorph can naturalise, which is the same claim from two directions:
   * buy them and the alliance question sorts itself out later. They were two rows
   * saying that separately, so they are one row now, and the Isomorph section below
   * keeps only the part the faces could never carry, which item pairs with what.
   */
  const freeFaces = useMemo(() => {
    const seen = new Set<string>();
    return [...FREE_CHOICE, ...ISOMORPH_CHOICE]
      .map((n) => byName.get(n))
      .filter((o): o is StrongholdOperator => !!o && !isBanned(o.operator))
      /* Was its own band-plus-one, ungated, so this row offered the tier above at
         Tier I while every other row on the screen refused it. */
      .filter(inReach)
      .filter((o) => (seen.has(o.operator) ? false : (seen.add(o.operator), true)))
      .sort(byTier);
  }, [byName, isBanned, inReach]);

  /** How many more operators would fall if this alliance were banned too. The number
   *  is the honest answer to "what does this button do", and it is rarely large. */
  const marginalBan = useCallback((alliance: string) => {
    const next = bannedAlliances.includes(alliance)
      ? bannedAlliances.filter((a) => a !== alliance)
      : [...bannedAlliances, alliance];
    let n = 0;
    for (const op of data.operators) {
      if (op.alliances.length > 0 && op.alliances.every((a) => next.includes(a))) n += 1;
    }
    return Math.abs(n - bannedOps.size);
  }, [data.operators, bannedAlliances, bannedOps.size]);

  /**
   * The 8 Core alliances, always askable -- unlike the strip below, which only
   * carries an alliance once the marks (or the strategy) have actually reached
   * it. Every run is built toward one of these eight, and a player deciding
   * which one to aim at needs to be able to open any of them from round one,
   * not just whichever has already picked up a mark.
   */
  const coreAlliances = useMemo(
    () => picker.filter((p) => p.alliance_type === 'Core'),
    [picker],
  );
  /** New Player mode's board: the star operators of each chosen Core, plus
   *  every member of that Core's own advised add-ons (CORE_TIPS.pairings) --
   *  not the Core's whole roster, just the two things worth a new player's
   *  attention. Star, then thumb, then plain, same order as everywhere
   *  else; capped to the first 20 by that order, with the remainder kept
   *  in the list but marked stale rather than dropped, so the count itself
   *  ("this is a lot") is still visible instead of quietly vanishing. */
  const NEW_PLAYER_CAP = 20;
  const newPlayerPool = useMemo(() => {
    if (!newPlayerCores.length) return [] as StrongholdOperator[];
    const starNames = new Set<string>();
    const addonAlliances = new Set<string>();
    for (const core of newPlayerCores) {
      for (const name of lockdowns.get(core) ?? []) starNames.add(name);
      for (const p of CORE_TIPS[core]?.pairings ?? []) addonAlliances.add(p);
    }
    /* 6-star only, plus Vigil and Lumen by name -- new players already have
       every other operator available to them, so this list has nothing new
       to offer someone still learning the mode. */
    const eligible = (op: StrongholdOperator) => SIX_STAR_OPERATORS.has(op.operator)
      || NEW_PLAYER_EXTRA_ACCESS.includes(op.operator);
    /* A thumb tied to the chosen Core itself outranks a thumb that only
       applies to one of its add-ons -- markKey alone says "thumb", not
       which alliance earned it, so a Core-alliance Good Stacker and an
       add-on Good Stacker sorted as ties before this. */
    const isCoreThumb = (op: StrongholdOperator) => newPlayerCores.some(
      (core) => (goodStackers.get(core) ?? []).includes(op.operator),
    );
    /* Whether a copier (Suzuran, Saria) actually has someone to copy within
       the chosen Core's own roster -- their own reads() predicate matched
       against every member of that Core, not against the whole roster, so
       this is specifically "pairs with THIS Core", not "pairs with someone,
       somewhere". */
    const pairsWithChosenCore = (copierName: string) => {
      const copier = COPIERS.find((c) => c.operator === copierName);
      if (!copier) return false;
      return newPlayerCores.some((core) => data.operators.some(
        (op) => op.operator !== copierName && op.alliances.includes(core) && copier.reads(op),
      ));
    };
    const rank = (op: StrongholdOperator) => {
      if (commitUnits.has(op.operator)) return 0;
      if (isCoreThumb(op)) return 1;
      if ((op.operator === 'Suzuran' || op.operator === 'Saria') && pairsWithChosenCore(op.operator)) return 2;
      if (praised.has(op.operator)) return 3;
      return 4;
    };
    /* Named reordering within the add-on-thumb tier (rank 3) specifically --
       Thorns the Lodestar, Astgenne the Lightchaser and Yu pushed toward its
       front, Mountain pushed to its very end and Ines to second-to-last.
       Everyone else in that tier keeps the default 0 and falls back to the
       usual tier sort between them. Large positive numbers for the two
       pushed down so they sort after any default-priority operator, however
       many the tier happens to hold for a given pick of Cores. */
    const ADDON_THUMB_PRIORITY: Record<string, number> = {
      Muelsyse: -4,
      'Thorns the Lodestar': -3,
      'Astgenne the Lightchaser': -2,
      Yu: -1,
      Ines: 98,
      Mountain: 99,
    };
    /* Neither Suzuran nor Muelsyse has an alliance tie of her own -- Suzuran's
       pick entry is a bare note ("Re-fires the obtained bonus of the unit
       ahead"), since she works as a copier rather than through alliance
       membership; Muelsyse's is the free-choice "Hands you a Damazti
       Isomorph". The roster's alliance-membership check below never picked
       either of them up as a result, whichever Core was chosen, so both are
       let in by name instead. */
    const alwaysEligible = new Set(['Suzuran', 'Muelsyse']);
    return data.operators
      .filter((op) => !isBanned(op.operator) && eligible(op)
        && (starNames.has(op.operator) || alwaysEligible.has(op.operator)
          || op.alliances.some((a) => addonAlliances.has(a))))
      .sort((a, b) => rank(a) - rank(b)
        || ((ADDON_THUMB_PRIORITY[a.operator] ?? 0) - (ADDON_THUMB_PRIORITY[b.operator] ?? 0))
        || byTier(a, b));
  }, [newPlayerCores, lockdowns, goodStackers, commitUnits, praised, data.operators, isBanned]);
  const newPlayerOverflow = Math.max(0, newPlayerPool.length - NEW_PLAYER_CAP);
  /** Retires the strategy tip (and pairing rosters) for every Core that has
   *  locked in so far. Called alongside dismissCurrentTip from the same two
   *  places -- marking an operator, pressing an alliance chip -- so the same
   *  press that answers the top-level tip also answers this one, but only
   *  for a Core that has actually locked; an undecided Core's tip is still
   *  live advice and a click elsewhere must not silently retire it. */
  const dismissLockedCoreTips = useCallback(() => {
    const locked = coreAlliances.filter((p) => isLockedIn(p.alliance)).map((p) => p.alliance);
    if (locked.length) {
      setDismissedCoreTips((d) => {
        const add = locked.filter((a) => !d.includes(a));
        return add.length ? [...d, ...add] : d;
      });
    }
    /* Same trigger, the Isomorph reminder's own retirement: any Core whose
       tip is currently showing (n has reached its own threshold) is marked
       dismissed, whether the press that caused this was on the badge
       itself or on any other operator/alliance elsewhere on the screen. */
    const liveIso = coreAlliances
      .filter((p) => ISOMORPH_ITEM[p.alliance] && effectiveCount(p.alliance) >= secondMilestone(p.alliance) - 1)
      .map((p) => p.alliance);
    if (liveIso.length) {
      setDismissedIsoTips((d) => {
        const add = liveIso.filter((a) => !d.includes(a));
        return add.length ? [...d, ...add] : d;
      });
    }
  }, [coreAlliances, isLockedIn, effectiveCount, secondMilestone]);
  /**
   * The Core row: all eight, until one is fully settled. A locked Core stays
   * in the row rather than dropping out of it into the ordinary strip -- it
   * moved there once, and the result read as the run's own commitment
   * vanishing rather than being confirmed. Sorted to the front instead: the
   * locked one leads, the rest follow dimmed (allyChip's own `dimmed`
   * state), banned ones pushed to the very end of THAT group.
   *
   * Once a Core fully settles (locked and manned, not just locked), the row
   * narrows to just that one Core rather than disappearing outright -- the
   * question the row was answering (which of the eight) has nothing left to
   * ask, but the settled Core itself still belongs left of the Add-on row,
   * not gone from the header entirely.
   */
  const coreRowAlliances = useMemo(() => {
    if (settled.length > 0) {
      /* Just the settled Core itself, not the full eight -- the question the
         row used to answer (which Core to aim for) is gone once one has
         fully settled, but the row itself should not vanish along with it.
         Left of the Add-on row is where a Core chip belongs, settled or
         not. */
      return coreAlliances.filter((p) => settled.includes(p.alliance));
    }
    /* A strategy that favours a specific Core -- a "starting buff" already
       pointed at it -- closes up the other Cores the same way an actual
       lock-down does, before a single operator has been marked. Skipped if
       the favoured Core is banned; a restriction still overrides a
       strategy's own lean. */
    const favouredCore = favoured.find(
      (f) => coreAlliances.some((c) => c.alliance === f) && !bannedAlliances.includes(f),
    ) ?? null;
    if (favouredCore) {
      return coreAlliances.filter((p) => p.alliance === favouredCore);
    }
    return [...coreAlliances].sort((a, b) => {
      const aLocked = isLockedIn(a.alliance) ? 0 : 1;
      const bLocked = isLockedIn(b.alliance) ? 0 : 1;
      if (aLocked !== bLocked) return aLocked - bLocked;
      const aOut = bannedAlliances.includes(a.alliance) ? 1 : 0;
      const bOut = bannedAlliances.includes(b.alliance) ? 1 : 0;
      return aOut - bOut;
    });
  }, [coreAlliances, isLockedIn, bannedAlliances, settled, favoured]);

  /**
   * The alliances on the board: ones the marks have actually reached, minus the
   * Cores the run has ruled out by committing elsewhere.
   *
   * Showing all twenty-three was worse than the problem it solved. The row is a
   * readout of the run first and a set of controls second, and twenty-three chips
   * for the two or three that matter buried them.
   *
   * The second half is what a commitment MEANS. Committing to a Core closes the
   * other Cores off, as the mode says and as the copy on the badge says, so
   * once one is committed the rest are not choices any more and stop being
   * offered. A Core that has its own commit unit in hand is the exception: two
   * committed Cores is a real, if unhappy, state, and hiding one of them would
   * hide the fact that the run is in it.
   */
  const strip = useMemo(() => {
    /* A marked operator puts an alliance here, and so does the strategy, before a
       single mark exists. Chiave hands you a Siracusa operator every six refreshes
       whatever you buy, so under Chiave the run's Core is settled at round one. The
       screen already treated that as locked down, but the alliance only appeared once
       you had marked somebody in it, which meant the one thing you knew before the
       shop opened was the one thing the screen would not show you. Now the favoured
       Core is on the strip from the start, at 0, and its roster is open under it. */
    /* Dispatch I and II also carry the four openers at zero, as OPENERS says. After
       that the run has a direction and the strip goes back to reporting only what the
       marks have actually built. */
    const opening = band <= 1;
    const here = picker.filter(
      (p) => (counts.get(p.alliance) ?? 0) > 0
        || favoured.includes(p.alliance)
        || (opening && OPENERS.includes(p.alliance)),
    );
    const committed = here.filter((p) => kindOf(p.alliance) === 'Core' && isLockedIn(p.alliance));
    if (!committed.length) return here;
    return here.filter((p) => kindOf(p.alliance) !== 'Core' || isLockedIn(p.alliance));
  }, [picker, counts, kindOf, isLockedIn, favoured, band]);

  /**
   * The strip as it is DRAWN: every add-on the mode lets you build toward, plus the
   * Cores a commitment has settled on -- and a flag for the ones the run has not
   * touched yet.
   *
   * `strip` above stays exactly as narrow as it was, because `bundleList` reads it and
   * a bundle per alliance is not what widening this asked for. This is a second list
   * for the chip row alone.
   *
   * The comment on `strip` says showing all twenty-three buried the two or three that
   * mattered, and on a Picture-in-Picture strip beside the game that is still true --
   * the compact block at the foot of gamemodes.css hides the quiet ones, so that
   * surface is unchanged. In a browser tab it was the other way round: fifteen add-ons
   * is one line of a row that had a thousand pixels of nothing in it, and an alliance
   * you cannot see is one you cannot press to read. So the answer is per surface, not
   * per alliance: drawn everywhere, dimmed until the run reaches it, hidden only where
   * there is genuinely no width for it.
   */
  const stripAll = useMemo(() => {
    const live = new Set(strip.map((p) => p.alliance));
    const lockedCoreNames = coreAlliances.filter((c) => isLockedIn(c.alliance)).map((c) => c.alliance);
    const isAdvised = (alliance: string) => lockedCoreNames.some(
      (core) => (CORE_TIPS[core]?.pairings ?? []).includes(alliance),
    );
    return picker
      /* Cores never show here any more -- the Core row above already keeps a
         locked Core visible (sorted to the front, the rest dimmed beside it),
         so re-adding it here duplicated it into both rows at once, which is
         exactly the "a locked Core still shows up in Add-on" bug this fixes. */
      .filter((p) => p.alliance_type !== 'Core')
      /* Solo and Assist Operator are NOT_A_PLAN, which means `askable` will not open
         them, so a permanent quiet chip for either would be a control that answers no
         press. Drawn only where the run has actually reached one, exactly as before.
         Every other quiet chip on this row opens. */
      .filter((p) => live.has(p.alliance) || !NOT_A_PLAN.has(p.alliance))
      /* Advised add-ons -- named by a Core that has actually locked in -- sort to
         the front of the row, right after the Core section, rather than sitting
         wherever the run happened to reach them. */
      .sort((a, b) => (isAdvised(a.alliance) ? 0 : 1) - (isAdvised(b.alliance) ? 0 : 1))
      .map((p) => ({ p, quiet: !live.has(p.alliance) }));
  }, [picker, strip, coreAlliances, isLockedIn]);

  /**
   * Every alliance a bundle could be drawn for.
   *
   * Since the strip carries all of them now, this does too, which means pressing
   * the chip of an alliance you have not touched opens its roster, and that is the
   * right answer to the press rather than a hole in it. What is NOT here is what
   * cannot be planned: the two the mode does not let you build toward, and anything
   * banned.
   *
   * NOT `building`: that is the run's plan, active or committed only, and is
   * right for the logic that reads it (the squad fit, the copier gates, the
   * shelf). Same order as the strip above, so pressing a chip lands on
   * the row you were looking at.
   */
  const bundleList = useMemo(
    () => strip
      .map((p) => p.alliance)
      .filter((a) => !NOT_A_PLAN.has(a))
      .filter((a) => !bannedAlliances.includes(a)),
    [strip, bannedAlliances],
  );

  /**
   * The bundles actually drawn, in the order they are drawn.
   *
   * A Core the run is on, switched on or committed, is always here. It is the
   * run's whole direction and it does not stop being that because the player asked
   * to look at something else. Hiding it behind a filter, which is what the first
   * version of this did, lost the committed Core the moment you pressed any other
   * chip.
   *
   * An add-on is only ever here by name: pressing its chip is the one way in, since
   * a bundle for it is bookkeeping rather than a decision. When it is asked for it
   * goes ABOVE the Cores, being the thing just asked about, and the Cores below it
   * are the standing context that was already on screen.
   */
  /**
   * What a press on a chip can open, which includes the restricted ones.
   *
   * `bundleList` leaves restricted alliances out, and it is right to: it feeds the
   * Cores that stand on screen by themselves, and a run does not plan toward
   * something it has ruled out. But it was also what a PRESS was checked against, so
   * pressing a restricted chip set the filter and then opened nothing, a button that
   * dimmed under the cursor and did nothing else.
   *
   * A restricted alliance is still a real question, and it has a real answer: an
   * operator is only out when EVERY alliance it belongs to is restricted, so most of
   * a restricted alliance is still on the board through its other one. That is exactly
   * what a player wants to see when they press it.
   */
  /**
   * What an alliance DOES, in the game's own words, as lines.
   *
   * From the data's own `effect`, which every one of the twenty-three has -- so this
   * answers for all of them rather than for the four that UNIVERSAL_ATTR happens to
   * name. The game writes these as several clauses separated by newlines, and they are
   * read as a list rather than a paragraph, so they stay separate lines here.
   *
   * UNIVERSAL_ATTR goes on the end where it exists, marked. It is a different claim
   * from the rest: not what this alliance gives ITS members, but what it pays the
   * whole board, which is the reason those four are worth stacking early and is not
   * something the effect text says plainly.
   */
  const allianceSay = useCallback((alliance: string) => {
    const row = picker.find((x) => x.alliance === alliance);
    return (row?.effect ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((raw) => {
        /* The condition comes off the front and becomes a label. It is the thing a
           reader scans for -- "does this apply to me yet?" -- and welded to the start
           of the sentence it was the thing they had to read past. */
        const when = raw.match(CLAUSE_WHEN)?.[1] ?? null;
        let text = raw.replace(CLAUSE_WHEN, '');
        /* Same fact, told once at the end as a tag rather than in the middle of the
           sentence in brackets. */
        const scales = SCALES.test(text);
        text = text.replace(SCALES, '');
        /* The tags are the game's UI markup, and inside this alliance's own block
           "[Agile] Operators" is just "Agile Operators". */
        text = text
          .replace(ALLIANCE_TAG, '$1')
          .replace(INLINE_WHEN, '($1)')
          .replace(/\s{2,}/g, ' ')
          .trim();
        return {
          when: when ? when.replace(ALLIANCE_TAG, '$1') : null,
          text,
          scales,
          /* Pays the WHOLE board, not just this alliance's members -- the reason the
             openers are worth stacking before a run has a direction. Read off the
             sentence rather than from a curated list, so every alliance is judged by
             the same rule and nothing has to be kept in step by hand. */
          board: BOARD_WIDE.test(text),
        };
      });
  }, [picker]);

  const askable = useMemo(() => {
    /* `stripAll`, not `strip`. The row now draws every add-on, dimmed until the run
       reaches it, and the whole case for drawing an untouched one is that you can
       press it to read who is in it. Left on `strip`, those chips set filterAlliance,
       failed this test, and the screen filtered to the Cores instead -- a press that
       silently did the wrong thing, which is exactly what nothing here would report. */
    const here = new Set(stripAll.map(({ p }) => p.alliance).filter((a) => !NOT_A_PLAN.has(a)));
    for (const p of coreAlliances) here.add(p.alliance);
    return [...here];
  }, [stripAll, coreAlliances]);

  const shownBundles = useMemo(() => {
    const onCores = bundleList.filter((a) => kindOf(a) === 'Core' && (isActive(a) || isLockedIn(a)));
    /**
     * Once one Core has settled the run, it is the only Core drawn.
     *
     * A Core stays on this list while it is merely locked, a farmer in hand with the
     * heads still missing, which is right until another Core arrives with BOTH. Then
     * the screen was showing two full rosters for a decision already made: eight
     * portraits of the run, above seven portraits of the run that is not happening,
     * under a line saying so. One of those is advice and the other is its own
     * contradiction taking up half the window.
     *
     * The loser is not lost: its chip stays in the strip above, because a locked Core
     * is still locked, and pressing it opens the roster through the `asked` path
     * below. Its marked operators fall through to the Other Selected Operators shelf
     * at the foot, which is where wasted marks belong anyway.
     */
    const cores = settled.length ? onCores.filter((a) => settled.includes(a)) : onCores;
    const asked = filterAlliance && askable.includes(filterAlliance) ? filterAlliance : null;
    /* Pressing a CORE is a request to read that Core, and the other Cores are the
       loudest thing competing with it, so that press clears the screen down to the
       one. Pressing an add-on is a smaller question ("who else is in this?") and
       leaves the Cores standing underneath, because they are the run and the add-on
       is a detail of it. */
    if (asked && kindOf(asked) === 'Core') return [asked];
    return asked && !cores.includes(asked) ? [asked, ...cores] : cores;
  }, [bundleList, askable, kindOf, isActive, isLockedIn, filterAlliance, settled]);

  /**
   * The marked operators no open bundle is already showing.
   *
   * The foot of the screen used to repeat every mark, which meant Kazimierz's
   * roster and the bar underneath held the same eight faces whenever Kazimierz was
   * the run. This carries the remainder instead: mark someone in Swift and they sit
   * here until you open Swift, at which point its roster has them and they leave,
   * and they come back when you close it again.
   *
   * Matched against the same filter a roster uses (in the alliance, not banned, in
   * reach), so "already showing" means actually on screen rather than theoretically
   * a member.
   */
  /**
   * The tip the board is asking for right now, regardless of whether it has
   * already been dismissed. `tip` below is this, filtered by dismissedTips --
   * kept separate so the Tip button beside Setup has something concrete to
   * bring back: "whichever tip applies to the board as it stands", not "the
   * last one that happened to be dismissed".
   *
   * The run's own state outranks the tier's standing advice: two committed operators is
   * a thing to fix now, and reading "you may try for triple copies" over the top of it
   * would be the screen talking past the player. Below that, one tip per tier.
   */
  const tipNow = useMemo(() => {
    const stars = building.filter((a) => kindOf(a) === 'Core' && isLockedIn(a));
    const coreOnBoard = strip
      .map((p) => p.alliance)
      .filter((a) => kindOf(a) === 'Core' && (counts.get(a) ?? 0) > 0);
    let id: string | null = null;
    if (stars.length >= 2) id = 'star-2';
    else if (stars.length === 1) id = settled.includes(stars[0]) ? 'locked' : 'star-1';
    else if (coreOnBoard.some((a) => (counts.get(a) ?? 0) >= 3)) id = 'unlocked';
    const key = id ?? `tier-${OPENING[band].tier}`;
    const fallback = id ? STATE_TIPS[id] : TIER_TIPS[OPENING[band].tier];
    const text = fallback ? tipText(language, key, fallback) : null;
    if (!text) return null;
    return { key, text };
  }, [building, kindOf, isLockedIn, settled, strip, counts, band, language]);
  const tip = useMemo(
    () => (tipNow && !dismissedTips.includes(tipNow.key) ? tipNow : null),
    [tipNow, dismissedTips],
  );
  /** Brings back whichever tip currently applies to the board -- the only way back
   *  to it short of a full Reset. Does nothing if nothing is dismissed right now,
   *  which is the correct no-op rather than clearing unrelated history. */
  const reopenTip = useCallback(() => {
    if (!tipNow) return;
    setDismissedTips((d) => d.filter((k) => k !== tipNow.key));
  }, [tipNow]);
  /* Handed to toggleGot, which runs long before this is worked out. */
  tipNowRef.current = tip?.key ?? null;

  /**
   * The Core row scrolls sideways instead of wrapping, so it always reads as
   * one line rather than growing into a second row that pushes everything
   * below it down mid-run. The arrows are shown only where there is
   * somewhere left to go -- an edge with nothing past it gets no button
   * rather than a disabled one, since a control that never does anything
   * from here is not worth the space.
   */

  const screen = (
    /* --gm-zoom carries the same number to CSS, because one rule needs to divide by
       it. A length inside a zoomed subtree is MULTIPLIED by the zoom, and that
       includes a sticky offset: .gm-co-topbar's `top` is the height of the site's
       fixed nav, and at 150% it was resolving to 1.5x that and sticking 26px below
       the nav, with the run scrolling through the hole. Measured at 430px: nav bottom
       52, topbar top 78. Dividing here rather than compensating with another
       inverse-zoom wrapper -- the wrapper trick is right for a box whose CONTENTS
       must not scale, and this is one number that must not. */
    <div className="gm-co" style={{ zoom: String(zoom), '--gm-zoom': String(zoom) } as React.CSSProperties} ref={rootRef}>
      {/* Heard, not seen: the sentence the last press on a face wrote. The got-ring
          and the strip count answer the press for eyes only, and this is the one
          action the screen exists for. Mounted from the start so assistive tech
          registers the region before it ever has anything to say. */}
      <span className="visually-hidden" aria-live="polite">{markSaid}</span>

      {/* Shrunk to a strip: the one control, and just enough to say what is behind it.
          Rendered instead of the screen rather than around it, so a collapsed window
          costs nothing to keep on top of the game. */}
      {collapsed && (
        <button
          type="button"
          className="gm-co-strip"
          onClick={toggleCollapsed}
          title="Open it back up"
        >
          <span className="gm-co-stripmark" aria-hidden="true">&#9662;</span>
          <span className="gm-co-stripwho">
            {building.length ? building.join(' · ') : 'Stronghold'}
          </span>
          <span className="gm-co-striptier">{OPENING[band].tier}</span>
        </button>
      )}

      {/* Setup takes the window.

          Three things have to be true before a word of the advice below means
          anything: which enemies you drew, which strategy you took, which alliances
          are out. Asking for them in a panel over a screen already full of
          answers got them skipped. The run was readable without them, so they went
          unanswered and the reading was wrong. So it is the whole window and one step
          at a time. Nothing to scroll past, nothing else to look at, and no way to be
          reading the run before the run knows what it is.

          A launch opens it, and the last step closes it. */}
      {!collapsed && setupOpen && (
        <div className="gm-co-setup" id="gm-co-setuppanel" style={vt('panel', 'setup')}>
          <div className="gm-co-steptop">
            <span className="gm-co-stepof">
              Step {step + 1} of 3
              {/* Quiet, and only here: setup is the one screen with room for it, and a
                  version number is of no use during a run. */}
              <b className="gm-co-version">{COMPANION_VERSION}</b>
            </span>
            {/* Inverse-zoomed for the same reason the run's dials are: a control that
                sizes the screen must not move under the finger that is pressing it. */}
            <span className="gm-co-stepsize" style={{ zoom: String(1 / zoom) }}>
              {sizeDial}
            </span>
            {/* Same language picker as the topbar's, reachable here too since setup
                is often the very first screen a player sees -- no reason the
                instructions below should stay English-only until they find the
                control elsewhere. */}
            <span className="gm-co-langbox">
              <button
                type="button"
                className={`gm-co-banbtn gm-co-langbtn${langOpen ? ' current' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                onClick={() => setLangOpen((v) => !v)}
                /* The label is two letters, so the language's own name lives in the
                   accessible name and the tooltip instead of on the button. */
                aria-label={`Language: ${currentLanguage?.name ?? 'English'}`}
                title={`Reading in ${currentLanguage?.name ?? 'English'} \u2014 read this step in another language`}
              >
                <span className="gm-co-langcode">{language.toUpperCase()}</span>
                <svg className="gm-co-langchev" viewBox="0 0 10 6" width="8" height="5" aria-hidden="true">
                  <path d="M0 0h10L5 6z" fill="currentColor" />
                </svg>
              </button>
              {langOpen && (
                <ul className="gm-picklist" role="listbox" aria-label="Language">
                  {LANGUAGES.map((l) => (
                    <li key={l.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={l.code === language}
                        className={`gm-pickopt${l.code === language ? ' current' : ''}`}
                        onClick={() => { chooseLanguage(l.code); setLangOpen(false); }}
                      >
                        {l.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
            {/* One mark a step, filled as far as you have come. The count says it in
                words for anything that reads them, and this says it at a glance. */}
            <span className="gm-co-stepdots" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i === step ? 'current' : (i < step ? 'done' : '')} />
              ))}
            </span>
          </div>

          {step === 0 && (
            <div className="gm-co-step">
              <h2 className="gm-co-stephead" ref={headRef} tabIndex={-1}>
                Enemy groups
                <em className={pools.length >= 2 ? 'set' : undefined}>
                  {pools.length ? `${pools.length} selected` : 'none selected'}
                </em>
              </h2>
              <p className="gm-co-stepsay">
                {setupText(language, 'pools', 'Select the 2 (solo simulation) or 3 (team simulation) enemy groups that appear in your run.')}
              </p>
              <div className="gm-co-threats">
                {data.enemyGroups.map((g) => {
                  const on = pools.includes(g.group);
                  const full = pools.length >= poolCap;
                  return (
                    <button
                      key={g.group}
                      type="button"
                      className={`gm-co-threat${on ? ' on' : ''}${!on && full ? ' spent' : ''}`}
                      aria-pressed={on}
                      disabled={!on && full}
                      onClick={() => withShift(() => setPools((ps) => (ps.includes(g.group)
                        ? ps.filter((x) => x !== g.group)
                        : [...ps, g.group].slice(0, poolCap))))}
                    >
                      <Badge name={poolTail(g.group)} icon={faceOf(g)} />
                      <span className="gm-co-threatname">{poolTail(g.group)}</span>
                      {/* No "Needs anti-air" here. Setup is where you say what you
                          DREW, and what a pool demands is not a thing you can answer
                          by picking differently. Printed at the moment of choosing
                          it reads as advice on the choice, which it is not. It belongs
                          where it is actionable: on the run screen, over the board you
                          can still do something about. */}
                    </button>
                  );
                })}
              </div>

              {/* The boss belongs with the enemies, because it is one, and it belongs in
                  setup because it is known before the first round rather than found
                  mid-run. Every openable boss sits at round 14, so a run meets exactly
                  one and picking it here is recording a fact, not a plan. */}
              <h3 className="gm-co-substep">
                Boss
                <em className={boss ? 'set' : undefined}>{boss ?? 'none selected'}</em>
              </h3>
              {/* Faces only. Boss names run to "'Samivilinn,' the Resolution of the Very
                  North", and in a window people keep deliberately narrow that wrapped
                  down to one letter a line. The art is how the game shows them anyway.
                  Name and HP ride the tooltip and the label, and the chosen one is
                  written out in full beside the heading above. */}
              <div className="gm-co-bosses">
                {bossChoices.map((b) => {
                  const on = boss === b.name;
                  return (
                    <button
                      key={b.name}
                      type="button"
                      className={`gm-co-boss${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${b.name}, ${hpShort(b.hp.standard)} HP`}
                      title={`${b.name} — ${hpShort(b.hp.standard)} HP`}
                      onClick={() => withShift(() => setBoss(on ? null : b.name))}
                    >
                      <Badge name={b.name} icon={b.icon} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="gm-co-step">
              <h2 className="gm-co-stephead" ref={headRef} tabIndex={-1}>
                Restricted alliances
                <em className={bannedAlliances.length ? 'set' : undefined}>
                  {bannedAlliances.length ? `${bannedAlliances.length} restricted` : 'none'}
                </em>
              </h2>
              <p className="gm-co-stepsay">
                {(() => {
                  const raw = setupText(
                    language,
                    'bans',
                    'Select the alliances that are restricted. You can come back to this during the run \u2014 the {{SETUP}} button reopens on this step.',
                  );
                  const [pre, post] = raw.split('{{SETUP}}');
                  return <>{pre}<b>Setup</b>{post}</>;
                })()}
              </p>
              {(['Core', 'Add-on'] as const).map((kind) => {
                const cap = BAN_CAP[kind];
                const used = bannedAlliances.filter((b) => kindOf(b) === kind).length;
                const full = used >= cap;
                return (
                <div key={kind} className="gm-pickrow">
                  {/* The count rides the row label, because the limit is a fact about
                      the ROW, three Cores and four add-ons, and a player who meets it
                      as a row of dead buttons with no number anywhere has been told
                      "no" without being told why. */}
                  <span className="gm-picklabel">
                    {kind}
                    <b className={full ? 'full' : undefined}>{used}/{cap}</b>
                  </span>
                  <span className="gm-picks">
                    {picker.filter((a) => a.alliance_type === kind).map((a) => {
                      const on = bannedAlliances.includes(a.alliance);
                      const n = marginalBan(a.alliance);
                      return (
                        <button
                          key={a.alliance}
                          type="button"
                          className={`terminal-tab gm-pick gm-co-banpick${on ? ' current' : ''}${!on && full ? ' spent' : ''}`}
                          aria-pressed={on}
                          disabled={!on && full}
                          onClick={() => toggleBanAlliance(a.alliance)}
                          title={on
                            ? `Allow ${a.alliance} again (${n} operators come back)`
                            : full
                              ? `A run can restrict ${cap} ${kind === 'Core' ? 'cores' : 'add-ons'}; allow one back first`
                              : `Ban ${a.alliance} (${n} more operators drop out)`}
                        >
                          <Badge name={a.alliance} icon={a.icon} />
                          {a.alliance}
                        </button>
                      );
                    })}
                  </span>
                </div>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="gm-co-step">
              <h2 className="gm-co-stephead" ref={headRef} tabIndex={-1}>
                Strategy
                {/* The name, not a tick. Thirty-six faces is a wall, and the one thing
                    a player wants back from a press into it is confirmation that the
                    face they hit is the strategy they meant, which only the name can
                    give them. The tile is marked as well, but this is what is READ. */}
                <em className={strategy ? 'set' : undefined}>
                  {strategy ? leaderName(strategy) : 'none selected'}
                </em>
              </h2>
              <p className="gm-co-stepsay">{setupText(language, 'strategy', 'Select the strategy you are using.')}</p>
              <div className="gm-picks gm-co-strats">
                {/* Data order, untouched: the file lists the 36 exactly as the game's own
                    strategy screen draws them, Warfarin first and Touch last, seven
                    full rows of five and one more, so this grid reads like the screen the
                    player is looking at. */}
                {data.strategies.map((st) => {
                  /* A squad that points at an alliance you have just ruled out. Chiave
                     hands you a Siracusa operator every six refreshes. Ban Siracusa and
                     the whole reason to pick her is gone. Marked rather than removed,
                     since it is a legal pick, and a strategy that quietly vanished would
                     read as a missing strategy rather than as a consequence of the bans.
                     This is why the bans come first now: they decide which squads are
                     even worth reading. */
                  const dead = (nudgeFor(st.leader)?.favours ?? [])
                    .filter((a) => bannedAlliances.includes(a));
                  return (
                    <button
                      key={st.leader}
                      type="button"
                      className={`terminal-tab gm-pick${strategy === st.leader ? ' current' : ''}${dead.length ? ' banned' : ''}`}
                      aria-pressed={strategy === st.leader}
                      onClick={() => withShift(() => setStrategy(strategy === st.leader ? null : st.leader))}
                      /* Faces only: the art is how the game teaches these, so the name
                         rides on the label and tooltip instead of under the portrait.
                         The restriction is said in WORDS as well as in red, because a
                         colour alone is a message a colour-blind reader never gets. */
                      aria-label={dead.length
                        ? `${leaderName(st.leader)}, favours ${dead.join(' and ')}, which you restricted`
                        : leaderName(st.leader)}
                      title={dead.length
                        ? `${leaderName(st.leader)} — favours ${dead.join(' and ')}, which you restricted`
                        : `${leaderName(st.leader)} — ${st.effect.split('\n')[0]}`}
                    >
                      <Badge name={leaderName(st.leader)} icon={st.icon ?? null} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pinned to the foot, the same two buttons in the same place at every step:
              it is what makes three screens read as one thing being worked through
              rather than three panels that happened to follow each other. */}
          <div className="gm-co-stepfoot">
            <button
              type="button"
              className="ghost gm-co-stepback"
              disabled={step === 0}
              onClick={() => withShift(() => setStep((n) => Math.max(0, n - 1)))}
            >
              &lsaquo; Back
            </button>
            {/* Only where the primary button is "Next". On the last step the primary
                IS leaving, so a Skip beside it would be two buttons doing one thing. */}
            {step < 2 && (
              <button
                type="button"
                className="gm-co-stepskip"
                onClick={leaveSetup}
                title="Go straight to the run — Setup reopens whenever you want it"
              >
                Skip
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                className="primary gm-co-stepnext"
                /* The pools are the only step that can be WRONG rather than merely
                   empty: a run drew two or three, every bundle below is built out of
                   them, and two is the smallest true answer. A strategy and a ban list
                   are allowed to be nothing, so neither of those holds the door. */
                disabled={step === 0 && pools.length < 2}
                title={step === 0 && pools.length < 2
                  ? 'Select the 2 or 3 enemy groups in your run first'
                  : undefined}
                onClick={() => withShift(() => setStep((n) => n + 1))}
              >
                Next &rsaquo;
              </button>
            ) : (
              <button
                type="button"
                className="primary gm-co-stepnext"
                onClick={leaveSetup}
              >
                {/* A run with marks on it is one you are already in, and "Start run"
                    over the top of it reads as an offer to throw it away. */}
                {got.length ? `${bt(language, 'backToRun', 'Back to run')} ›` : `${bt(language, 'startRun', 'Start run')} ›`}
              </button>
            )}
          </div>
        </div>
      )}

      {!collapsed && !setupOpen && (<>
      {/* Everything you press, in the sticky header: the reading controls above, the
          tier bands below, and under those the alliances the marks are building,
          the game's own strip, icon and count, lit once the count activates it. */}
      <div className="gm-co-topbar">
        {/* Inverse-zoomed, so the dials hold still at every size. They used to scale
            with the screen they size: pressing + moved + out from under the pointer,
            and a spam-click landed on the % readout, which resets to 100. Both rows
            share the one wrapper so both hold still together. */}
        <div className="gm-co-dialswrap" style={{ zoom: String(1 / zoom) }}>
        <CompanionScrollRow className="gm-co-dials">
          {/* Size, first on the row, because it is the control you reach for once and
              then never again, and because everything to the right of it is what you
              were trying to read when you reached for it. */}
          {sizeDial}
          <button
            type="button"
            className={`gm-co-banbtn gm-co-guidebtn${guideOpen ? ' current' : ''}`}
            aria-pressed={guideOpen}
            aria-expanded={guideOpen}
            aria-controls="gm-co-guidepanel"
            onClick={() => withShift(() => { setGuideOpen((v) => !v); setSetupOpen(false); })}
            title="How the mode itself is played"
          >
            {bt(language, 'guide', 'Guide')}
          </button>
          {/* Setup and Reset live in this row rather than in a full-width bar of
              their own. Neither is a control of the RUN, since setup is settled before
              the first round and reset ends it, so a bar the width of the window, held
              for the whole game, was the screen's second-most prominent thing spent on
              its two least-used buttons. Here they are one press away and take no
              height at all. */}
          <button
            type="button"
            /* `done` once the run is set up, with two pools picked as the sign that
               setup happened, so the button recedes for the rest of the run. Still
               pressable, because bans and strategy stay editable behind it. */
            className={`gm-co-footbtn${setupOpen ? ' current' : ''}${pools.length >= 2 && !setupOpen ? ' done' : ''}`}
            aria-pressed={setupOpen}
            aria-expanded={setupOpen}
            aria-controls="gm-co-setuppanel"
            /* Reopens on Step 3 once the run is set up: the bans are the step you
               come back for, since the pools and the strategy were settled before
               the first round, and Back is right there if it was one of those. */
            onClick={() => withShift(() => {
              setSetupOpen((v) => {
                if (!v) setStep(pools.length >= 2 ? 1 : 0);
                return !v;
              });
              setGuideOpen(false);
            })}
          >
            {bt(language, 'setup', 'Setup')}
          </button>
          {/* A second, simpler front door beside Setup's: drops the Level I-VI shop
              entirely and narrows the board to just the star operators of up to two
              chosen Cores plus their advised add-ons -- a starting point for someone
              who does not want to shop tier by tier yet. A toggle, not a wizard step:
              pressed again, it hands the screen straight back to the ordinary tool. */}
          <button
            type="button"
            className={`gm-co-footbtn${newPlayerMode ? ' current' : ''}`}
            aria-pressed={newPlayerMode}
            onClick={() => withShift(() => {
              setNewPlayerMode((v) => !v);
              setSetupOpen(false);
              setGuideOpen(false);
            })}
            title={newPlayerMode
              ? 'Back to the full tool'
              : 'A simpler starting point: pick up to three core alliances and see just their star operators'}
          >
            {bt(language, 'newPlayer', 'New Player')}
          </button>
          {/* Back on the right, under Collapse. It was exiled to the far left when a
              single misclick could throw the run away. Now a wipe takes an armed
              second press, so the position costs nothing and the row reads in the
              game's own order again. */}
          <button
            type="button"
            className={`gm-co-reset${resetArmed ? ' armed' : ''}`}
            onClick={() => {
              /* The first press only arms it, and the wipe waits for the second. */
              if (!resetArmed) {
                setResetArmed(true);
                if (resetTimer.current) clearTimeout(resetTimer.current);
                resetTimer.current = setTimeout(() => {
                  resetTimer.current = null;
                  setResetArmed(false);
                }, 4000);
                return;
              }
              disarmReset();
              /* Straight to Step 1, because a reset IS a new run and a run is set up
                 before it is played, which is the screen a launch opens on. */
              withShift(() => { resetRun(); setStep(0); setSetupOpen(true); });
            }}
            onBlur={disarmReset}
            title={resetArmed
              ? 'Press again to clear the run'
              : 'Clear the run and start a new one'}
          >
            {resetArmed ? bt(language, 'resetSure', 'Sure? Reset all') : bt(language, 'reset', 'Reset')}
          </button>
          <span className="gm-co-modes">
            {/* Only when there is a window to shrink. Inline, the page has no strip to
                collapse to and the button would do nothing visible. */}
            {pip.isOpen && (
              <button
                type="button"
                className="gm-co-banbtn gm-co-minbtn"
                onClick={toggleCollapsed}
                title="Shrink to a strip"
              >
                {bt(language, 'collapse', 'Collapse')}
              </button>
            )}
          </span>
        </CompanionScrollRow>
        {/* Second row: the tip controls and the overlay toggle, which used to float
            over the run at the bottom-right corner. Grouped here instead, since all
            three are the same kind of thing -- a standing preference about how the
            screen reads, not a control of the run itself the way row one's buttons
            are. */}
        <CompanionScrollRow className="gm-co-dials gm-co-dials2">
          {/* Brings the current tip back after a click has dismissed it -- the only
              way back to it short of a full Reset. Disabled rather than hidden when
              there is nothing to bring back, so the row does not reflow depending on
              dismissal state. */}
          <button
            type="button"
            className="gm-co-footbtn"
            disabled={!tipNow || !dismissedTips.includes(tipNow.key)}
            onClick={() => withShift(reopenTip)}
            title="Show the current tip again"
          >
            {/* "Tips" until the switch beside it dropped its ON/OFF suffix, at which
                point there were two buttons in one row both reading Tips. This one
                replays a dismissed tip; that one decides whether any tip shows. */}
            {bt(language, 'showTip', 'Show Tip')}
          </button>
          {/* The master switch, beside the Tips button rather than folded into it --
              that one brings a single dismissed tip back; this one decides whether
              any tip shows at all. ON changes nothing about the existing dismissal
              rules; OFF overrides every one of them at once, for every kind of tip
              this screen has. A preference, not part of the run, so Reset leaves it
              alone. Green/red rather than the neutral teal "current" treatment --
              an ON/OFF pair reads faster as a traffic light than as "pressed or
              not". */}
          <button
            ref={tipsBtnRef}
            type="button"
            className={`gm-co-footbtn ${tipsEnabled ? 'gm-co-on' : 'gm-co-off'}`}
            aria-pressed={tipsEnabled}
            onClick={() => withShift(toggleTipsEnabled)}
            /* The words live here now that the label is colour alone. aria-pressed
               carries the state properly; this is for anyone hovering. */
            title={tipsEnabled ? 'Tips are on — turn them off' : 'Tips are off — turn them on'}
          >
            {bt(language, 'tips', 'Tips')}
          </button>
          {/* Was fixed over the bottom-right corner of the run. Moved in here beside
              the other two standing preferences -- a switch you set once and forget
              belongs with its own kind, not floating over the portraits it affects.
              Same ON/OFF label and green/red treatment as Tips beside it, rather
              than "Toggle X" naming its action instead of its state. */}
          <button
            type="button"
            className={`gm-co-footbtn ${overlays ? 'gm-co-on' : 'gm-co-off'}`}
            /* Was `!overlays`, which said "not pressed" of a switch that was on. It
               mattered less while the label spelled ON or OFF beside it; with the state
               told in colour, this is the only place a screen reader can read it. */
            aria-pressed={overlays}
            onClick={toggleOverlays}
            /* "Icons" on the button, "Alliance icons" in the accessible name. Two words
               was the widest thing in a row that has to fit a phone, and the row is the
               only place the shorter one is ambiguous -- these are the only icons this
               screen has a switch for. A screen reader still hears which. */
            aria-label="Alliance icons"
            title={overlays
              ? 'Alliance icons are on — hide the sigils and combos over the portraits'
              : 'Alliance icons are off — show the sigils and combos over the portraits'}
          >
            {bt(language, 'icons', 'Icons')}
          </button>
          {/* Third of the standing preferences, beside its own kind. The descriptions
              are several lines under every alliance on screen, which is what a reader
              wants while they are learning the mode and the first thing they want gone
              once they know it. */}
          <button
            ref={descBtnRef}
            type="button"
            className={`gm-co-footbtn ${descriptions ? 'gm-co-on' : 'gm-co-off'}`}
            aria-pressed={descriptions}
            onClick={() => withShift(toggleDescriptions)}
            title={descriptions
              ? 'Descriptions are on — hide what each alliance does'
              : 'Descriptions are off — show what each alliance does'}
          >
            {bt(language, 'descriptions', 'Descriptions')}
          </button>
          {/* Pushed to the right end of the row -- the three preferences to its
              left are read left to right in the order you'd reach for them, and
              Language is the one you set once and rarely touch again, same as
              Reset+Collapse sit apart from row one's more frequent presses. */}
          <span className="gm-co-langbox gm-co-langpush">
            <button
              type="button"
              className={`gm-co-banbtn gm-co-langbtn${langOpen ? ' current' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              onClick={() => setLangOpen((v) => !v)}
              aria-label={`Tip language: ${currentLanguage?.name ?? 'English'}`}
              title={`Tips are in ${currentLanguage?.name ?? 'English'} \u2014 view them in another language`}
            >
              <span className="gm-co-langcode">{language.toUpperCase()}</span>
              <svg className="gm-co-langchev" viewBox="0 0 10 6" width="8" height="5" aria-hidden="true">
                <path d="M0 0h10L5 6z" fill="currentColor" />
              </svg>
            </button>
            {langOpen && (
              <ul className="gm-picklist" role="listbox" aria-label="Language">
                {LANGUAGES.map((l) => (
                  <li key={l.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={l.code === language}
                      className={`gm-pickopt${l.code === language ? ' current' : ''}`}
                      onClick={() => { chooseLanguage(l.code); setLangOpen(false); }}
                    >
                      {l.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        </CompanionScrollRow>
        </div>
        {/* Which tier the shop is on, in the sticky header with everything else you
            press. A band shows its own picks and every band below it. Dropped
            entirely in New Player mode -- there is no tier to browse once the
            board has narrowed to just two Cores' star operators. */}
        {!newPlayerMode && (
        <CompanionScrollRow className="gm-co-bands">
          {OPENING.map((b, i) => (
            <button
              key={b.tier}
              type="button"
              className={`gm-co-band${i === band ? ' current' : ''}`}
              aria-pressed={i === band}
              /* Said on the button again, not only in the label. Dropping it to buy
                 width left "III 4-7" reading just as easily as "tier three of seven",
                 and the legend that fixed that cost the row it saved and looked
                 stale beside whichever tier was actually selected. The word is the
                 cheaper answer. It labels the numeral in place, and stacking the two
                 halves gives it the width to sit in. */
              aria-label={`LVL ${b.tier}, rounds ${b.rounds}`}
              title={`LVL ${b.tier} — rounds ${b.rounds}`}
              onClick={() => withShift(() => setBand(i))}
            >
              <b>LVL {b.tier}</b>
              {/* Just the numbers. Six of these share the width four used to have, and
                  the word "rounds" was the part that did not fit. */}
              <em>{b.rounds}</em>
            </button>
          ))}
        </CompanionScrollRow>
        )}
        {/* Every Core that has not locked in, always -- unlike the strip below,
            this one does not wait for a mark. A player deciding which of the 8
            to aim at needs to be able to open any of them from round one. The
            same chip the dynamic strip uses (icon, count, lit, banned
            red-cross), just fed the still-open Cores unconditionally instead of
            only the ones with a mark on them. One line, never wrapping: the
            arrows scroll sideways rather than letting the row grow into a
            second line that shoves the rest of the screen down mid-run. */}
        {/* The Cores and the add-ons on ONE line, divided, rather than stacked.
            Two rows was two rows of mostly nothing in a browser tab: eight chips in a
            1372px row, then four more in another. Twenty-three chips is about 1130px,
            so the whole readout fits across once, and the rule between the groups says
            which half is which -- the same thing the stacked rows were using their
            separate lines to say, in a fraction of the height.
            It goes back to stacked in the compact block at the foot of gamemodes.css,
            where there is no width to share and the Core row wants its scroll. */}
        <div className="gm-co-allrow">
        {coreRowAlliances.length > 0 && (
          <div className="gm-co-corewrap">
            {/* Which half of the row this is. The divider says there are two groups
                and the chips' own 0/3 and 0/2 hint at it, but neither NAMES them, and
                Core vs add-on is the distinction the whole run turns on. Same two
                words the ban step's labels use, so the two screens agree. */}
            <span className="gm-co-allylabel">Core</span>
            {/* The fade says there is more, the rail says how much more and where in
                it you are, and the rail can be dragged. Two arrow buttons used to do
                the last of those and nothing else; they were 14px targets either side
                of the row and are gone, with the measurement they needed -- a second
                scroll listener and ResizeObserver on the same element ScrollRow was
                already watching. */}
            <CompanionScrollRow className="gm-co-corerow">
              {coreRowAlliances.map((p) => allyChip(p, false))}
            </CompanionScrollRow>
          </div>
        )}
        {/* The game's own alliance readout: icon, count under it, lit at activation.
            It grows as operators are marked, exactly the way the in-game panel does,
            and each chip is now the way to read just that alliance. Press it and the
            bundles below narrow to it, press it again for all of them back. Dropped
            entirely in New Player mode -- only Cores are meant to be clickable there,
            and the Core row above already covers that on its own. */}
        {!newPlayerMode && (stripAll.length > 0 || filterAlliance) && (
          <div className="gm-co-allys">
            <span className="gm-co-allylabel">Add-on</span>
            <CompanionScrollRow className="gm-co-addonrow">
              {stripAll.map(({ p, quiet }) => allyChip(p, quiet))}
              {/* Rightmost, and only while something is actually open -- closing what
                  you are looking at is the one thing every other chip in this row
                  cannot also do, since pressing one of THEM opens a different
                  alliance rather than closing this one. Same card as the rest of the
                  row, so it reads as one more chip rather than a different kind of
                  control bolted onto the end of it. */}
              {filterAlliance && (
                <button
                  type="button"
                  className="gm-co-ally gm-co-return"
                  onClick={() => withShift(() => setFilterAlliance(null))}
                  title={`Close ${filterAlliance} and show the Tier shelf again`}
                >
                  {bt(language, 'return', 'Return')}
                </button>
              )}
            </CompanionScrollRow>
          </div>
        )}
        </div>
        {/* The board-wide line that used to sit here has moved under each alliance's
            own name, where it is one of several things said about that alliance rather
            than a lone fact floating in the header -- and where all twenty-three get
            one instead of four. Gone from here entirely rather than kept in both
            places: the header is the part of this screen with the least room to spare,
            and a conditional line in a STICKY header changes its height mid-run, which
            is the one thing this bar must never do. */}
      </div>


      {guideOpen && (
        /* The id is what the Guide button's aria-controls names. */
        <div className="gm-co-guide" id="gm-co-guidepanel" style={vt('panel', 'guide')}>
          <div className="gm-co-guidetabs">
            {([false, true] as const).map((c) => (
              <button
                key={String(c)}
                type="button"
                className={`gm-co-guidetab${guideCoop === c ? ' current' : ''}`}
                aria-pressed={guideCoop === c}
                onClick={() => setGuideCoop(c)}
              >
                {c ? 'Co-op' : 'Solo'}
              </button>
            ))}
          </div>
          {(guideCoop ? GUIDE.coop : GUIDE.solo).map((n) => (
            <p key={n.text} className="gm-co-guidenote">
              {n.head && <b>{n.head}</b>}
              {n.text}
            </p>
          ))}
          <span className="gm-co-label">Round by round</span>
          <ul className="gm-co-guiderounds">
            {GUIDE.rounds.map((r) => (
              <li key={r.at}>
                <span className="gm-co-guideat">{r.at}</span>
                <span className="gm-co-guidesteps">
                  {r.steps.map((t) => <em key={t}>{t}</em>)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Only what you drew. The other five pools are not in your run and a tile for
          each of them is five sevenths of this row saying nothing. */}
      {threats.length > 0 && (
        <div className="gm-co-threats gm-co-drawn" style={vt('block', 'threats')}>
          {threats.map((t) => (
            <DrawnPool key={t.group} pool={t.pool} needs={t.needs} icon={t.icon} still={stillMotion} />
          ))}
          {/* Beside the pools, because it is the same kind of fact: what this run has
              to beat. Only once it has been recorded, so a run that skipped setup is
              not told about a boss it never named. */}
          {bossNow && (
            <div className="gm-co-threat on gm-co-bosstile" title={`${bossNow.name} — ${hpShort(bossNow.hp.standard)} HP`}>
              {/* The face alone. The pools beside it are turning a name over into a
                  need, and a fourth tile printing a number held still next to that was
                  the only thing in the row asking to be read rather than recognised.
                  Name and HP are on the tooltip, and said once for a screen reader. */}
              <Badge name={bossNow.name} icon={bossNow.icon} />
              <span className="visually-hidden">
                {`Boss: ${bossNow.name}, ${hpShort(bossNow.hp.standard)} HP`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Under the enemies, not over them. The tip is advice about the run, and the
          run's first fact is what it drew -- reading the advice before the thing it is
          advice about put the answer above the question. It also kept moving: the tip
          appears and disappears as the board changes, and above the enemy row that
          pushed the whole board down and back up again. Below it, the only thing it
          moves is itself and what follows. */}
      {!collapsed && !setupOpen && !newPlayerMode && tipsEnabled && tip && (
        <p className={`gm-co-tip${tip.key === 'star-2' ? ' gm-co-tip-danger' : ''}`} role="status">{tip.text}</p>
      )}

      {/* Whatever band is showing. A field that cannot hold what the marks have built
          is not news that should wait for the player to click Tier V, and a banned
          alliance the marks keep feeding is a contradiction worth saying out loud. */}

      {/* One bundle per alliance the marks are building: its people in one row, the
          ones still missing greyed but pressable, and under it whatever that alliance
          now asks for: the farmer that would commit it, and the copiers that read
          its attribute timings.

          Only the ones that are actually switched on open. An alliance sitting at one
          of three heads is a maybe, and a screen of maybes at full height buried the
          one or two alliances the run is really on, so those show as a single line
          each instead. Pressing a line, or its chip in the strip above, filters to it,
          and a filtered alliance always opens, since asking to see one and being
          handed its collapsed row would be the filter doing nothing. */}
      {shownBundles.map((a) => {
        const meta = picker.find((x) => x.alliance === a);
        const say = allianceSay(a);
        const n = effectiveCount(a);
        const need = needOf(a);
        const locked = isLockedIn(a);
        /* Which mechanism locked it: a farmer in hand beats the label, and only a
           strategy lock with no farmer yet says so. The distinction is what tells
           the player whether the lock-down units below are still worth hunting. */
        const byUnit = (lockdowns.get(a) ?? []).some((u) => got.includes(u));
        const done = settled.includes(a);
        const isCore = kindOf(a) === 'Core';
        /* Opened from a restricted chip. The roster below already drops the operators
           the restriction actually costs you, the ones with nowhere else to be,
           so what is left is the answer to "who in here do I still have", and the
           header has to say which question it is answering. */
        const restricted = bannedAlliances.includes(a);
        /* Every tier, always, Core or add-on.
           An alliance's own block asks "what does this alliance HAVE", not "what can I
           buy this round" -- you open it from a chip in the row above to read the
           roster, and a roster that changes shape with the Dispatch level cannot be
           read as one. A Core was already unconditional for that reason; an add-on was
           capped to the shop's reach unless it had locked a farmer in, so the same view
           answered a different question depending on which chip opened it.
           The pairing sub-rosters below follow the same rule, for the same reason: they
           are part of this view, and a block whose three rosters stopped at three
           different tiers could not be read at all.
           Where the level DOES apply is what is genuinely a shopping list: the tier
           shelf, the free-agent row, and the copier suggested on a face -- all three
           answer "what should I pick up now", and all three read reachCeiling. */
        const members = data.operators
          .filter((op) => op.alliances.includes(a) && !isBanned(op.operator))
          .sort(byTier);
        /* Another Core is locked AND manned, so this one is the one to liquidate. */
        const sellOff = isCore && !done && settled.length > 0;
        return (
          <div key={a} className={`gm-co-block gm-co-bundle${restricted ? ' restricted' : ''}`} style={vt('bundle', a)}>
            {tipsEnabled && isCore && CORE_TIPS[a] && !dismissedCoreTips.includes(a) && (
              <p className="gm-co-tip gm-co-coretip" role="note">{CORE_TIPS[a].text}</p>
            )}
            {tipsEnabled && isCore && ISOMORPH_ITEM[a] && !dismissedIsoTips.includes(a)
              && n >= secondMilestone(a) - 1 && (
              <p className="gm-co-tip gm-co-isotip" role="note">
                If you have equipped someone with the Damazti Isomorph Pair, click the pair to
                activate it. Click the x1/x2 counter to raise it further or click the pair again
                to remove it.
              </p>
            )}
            <span className="gm-co-label">
              {meta && <Badge name={a} icon={meta.icon} />}
              {/* The middots are gone with the switch to a flex row: they were
                  hand-drawn spacing, and the gap does it now. Keeping both left
                  each part a dot's width from its own left edge, which is what
                  stopped the line looking aligned. */}
              <span className="gm-co-labelname">{a}</span>
              <em>{isCore ? 'core' : 'add-on'}</em>
              {restricted && (
                <span className="gm-co-restricted" title="Restricted this run — these are the members you can still reach through another alliance">
                  Restricted
                </span>
              )}
              <b>{n}{need != null ? `/${need}` : ''}</b>
              {/* This alliance's Isomorph pairing, where it has one and the shop is
                  late enough to sell it. In the header because it is a fact ABOUT
                  the alliance, that these two items make a free agent a member of
                  it, and it was sitting in a section of its own, several blocks
                  down, next to the pairings for every other alliance at once.
                  Interactive: the player has no other way to tell the screen an
                  Isomorph is equipped, so the badge doubles as the input. Click
                  while off turns it on (x1); the counter that then grows out of it
                  raises the count to x2 and x3; clicking the badge itself, not the
                  counter, is what takes it back off. */}
              {isomorphBadge(a)}
            </span>
            {/* Under the name, which is where a reader asks the question it answers:
                they have just read WHICH alliance this is and the next thing they want
                is what it would do for them. It used to be one line in the sticky
                header, for one alliance at a time, and only for the four that
                UNIVERSAL_ATTR named -- so the other nineteen were a name, a count and
                nothing to judge them on. */}
            {descriptions && say.length > 0 && (
              <p className="gm-co-allyeffect">
                {say.map((c, i) => (
                  <span
                    /* Index: two clauses of one alliance can read the same after the
                       condition has been lifted out of them, and the list is fixed. */
                    key={i}
                    className={c.board ? 'gm-co-allyeffect-all' : undefined}
                  >
                    {c.when && <b>{c.when}</b>}
                    {c.text}
                    {c.scales && <em>scales with stacks</em>}
                  </span>
                ))}
              </p>
            )}
            {sellOff && (
              <p className="gm-co-sell" role="status">
                Sell these off &mdash; {settled.join(' + ')} is the run now.
              </p>
            )}
            {/* One face per member, flat. The copier that reads a member rides that
                member's bottom-right corner rather than sitting under them: the pair
                is one purchase and now looks like one object, and the roster stays a
                single row of faces instead of doubling in height. A copier reading
                two members appears on both. */}
            <div className="gm-co-roster">
              {members.map((op) => {
                const badge = isCore ? undefined : lockedCores.find((c) => op.alliances.includes(c));
/* Drawn on every roster now, not only on a locked-down one.
                   The lock gate made sense while only Cores reached this code. A
                   copier is a follow-up purchase, and suggesting one for an alliance
                   the run had not committed to was noise. But an ADD-ON bundle is only
                   ever on screen because the player pressed its chip, and an add-on
                   almost never satisfies isLockedIn anyway. The guide tags barely any
                   of them with a farmer, so the gate silently meant "Cores only" and
                   Saria's half of the roster never appeared. A bundle you are looking
                   at is a bundle whose combos you want. Still capped to what the shop
                   can actually offer, and still never a banned unit. */
                const pair = overlays && comboWorthy(op)
                  ? COPIERS
                    .filter((c) => c.operator !== op.operator && c.reads(op))
                    .map((c) => ({ c, cop: byName.get(c.operator) }))
                    .find((x) => !!x.cop && !isBanned(x.cop.operator) && (isCore || inReach(x.cop)))
                  : undefined;
                const cop = pair?.cop;
                /* Every member is wrapped, copier or not. The wrapper is what the
                   grid lays out, and a bare face is a different box type from a
                   wrapper (blockified inline-flex against inline-block), so mixing
                   the two in one grid made the faces WITH a copier size differently
                   from the faces without. One element type per cell, always.
                   The copier itself sits OVER the face's corner as a sibling rather
                   than inside it: it has to be pressable in its own right, and a
                   button inside a button is not a thing HTML will parse. */
                return (
                  <span key={op.operator} className="gm-co-facewrap">
                    {opFace(op, 'gm-co-member', badge, a,
                      cop && pair ? { op: cop, why: `${pair.c.operator} ${pair.c.why}` } : undefined,
                      ISOMORPH_FACE_TARGETS[a]?.[op.operator])}
                    {cop && pair && (
                    <button
                      type="button"
                      className={`gm-co-facepair${got.includes(cop.operator) ? ' got' : ''}`}
                      aria-pressed={got.includes(cop.operator)}
                      aria-label={`${cop.operator}, copies ${op.operator}${got.includes(cop.operator) ? ', got' : ''}`}
                      title={`${cop.operator} — ${pair.c.why}`}
                      onClick={(e) => { e.stopPropagation(); toggleGot(cop.operator); }}
                    >
                      <Badge name={cop.operator} icon={cop.icon} />
                    </button>
                    )}
                  </span>
                );
              })}
            </div>
            {/* The pairings side by side, not stacked. A Core carries two to four of
                them and each is a roster of about five faces, so stacked they were four
                short lines down the left of a block a thousand pixels wide. The gap
                between the columns is doing the work the stacking used to: these are
                separate alliances, and a wide column-gap says so more plainly than a
                line does. One column again in the compact block. */}
            {/* No longer gated on dismissedCoreTips, which is what made these vanish the
                moment a Core was committed: dismissLockedCoreTips marks every locked-in
                Core dismissed, and the tip and the pairings were sharing that one flag.
                Retiring the TIP there is right -- it is advice about a decision, and the
                commitment IS the decision. The pairings are not advice about the
                decision, they are the rosters you build the committed Core out of, so
                they are most wanted exactly when the tip stops being. */}
            {/* The pairing rosters open on a PRESS, not on the Core being active.
                Two different questions were sharing one condition. A Core that is
                merely running is the standing answer to "where is this run going",
                and it drew three rosters -- its own and two add-ons' -- for a reader
                who had not asked about either add-on. Pressing the Core's chip IS
                asking to read that Core, and the add-ons worth reading beside it are
                part of that answer; that press already clears the screen to this one
                bundle (see shownBundles), so there is room for them and nothing else
                competing. Active shows the Core alone; asked shows the Core and what
                pairs with it. */}
            {isCore && filterAlliance === a && !!CORE_TIPS[a]?.pairings?.length && (
            <div className="gm-co-pairings">
            {CORE_TIPS[a]?.pairings?.map((pairAlliance) => {
              const pairMeta = picker.find((x) => x.alliance === pairAlliance);
              /* Investor pays off on being ACTIVATED rather than on any one member
                 being a stacker, which is still worth saying on the label even now
                 that every pairing shows its whole roster. */
              const activationOnly = pairAlliance === 'Investor';
              /* THE WHOLE ALLIANCE, every tier, exactly like the block this sits in.
                 Two things were stripped out of this filter to get here. First the
                 guide's shortlist -- its star and thumb lists plus genuine bridges --
                 which showed four or five faces out of a dozen while the shop deals
                 from all of them; opFace still draws the star and the thumb, so the
                 guide's picks read as the guide's picks and the rest are at least
                 known. Then the Dispatch-level cap, which is the part that was wrong
                 twice: these rosters are part of an ALLIANCE VIEW, and the view is read
                 rather than shopped. Open Sargon at Tier II and its own roster ran to
                 Tier VI while Swift and Precision stopped at Tier II -- three rosters
                 in one block, two of them answering a question nobody had asked.
                 Banned operators stay out, because those the shop will genuinely never
                 offer. */
              const pairMembers = data.operators
                .filter((op) => op.alliances.includes(pairAlliance) && !isBanned(op.operator))
                .sort(byTier);
              if (pairMembers.length === 0) return null;
              return (
                <div key={pairAlliance} className="gm-co-pairing">
                  <span className="gm-co-label gm-co-pairinglabel">
                    {pairMeta && <Badge name={pairAlliance} icon={pairMeta.icon} />}
                    <span className="gm-co-labelname">{pairAlliance}</span>
                    {activationOnly && <em>Activation is Enough</em>}
                    {isomorphBadge(pairAlliance)}
                  </span>
                  <div className="gm-co-roster">
                    {pairMembers.map((op) => (
                      <span key={op.operator} className="gm-co-facewrap">
                        {/* The bridge: this pairing operator also belongs to the
                            Core being viewed, so coreLink lights the same amber
                            outline a Core-feeding member gets everywhere else it
                            appears. */}
                        {opFace(op, 'gm-co-member', op.alliances.includes(a) ? a : undefined, pairAlliance)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
            )}
            {/* The reverse of the block above: an add-on's own bundle, open, shows
                which Cores name IT as one of their pairings -- "click an add-on and
                see what pairs well with it", the same fact read from the other
                direction. Not gated to any tier band; a pairing is a fact about the
                two alliances, not about which shop tier happens to be showing.

                Hidden entirely once ANY Core has locked in OR a strategy favours one,
                not just filtered down to exclude that one Core -- once the run has
                committed to a Core, "which Core could this still pair with" is not a
                live question for any add-on any more, the same way every other Core
                reads as settled history once one of them locks or gets favoured (see
                allyChip's own `dimmed`). */}
            {!isCore && filterAlliance === a
              && !coreAlliances.some((c) => isLockedIn(c.alliance) || favoured.includes(c.alliance)) && (() => {
              const pairingCores = coreAlliances.filter(
                (c) => (CORE_TIPS[c.alliance]?.pairings ?? []).includes(a),
              );
              if (!pairingCores.length) return null;
              return (
                <div className="gm-co-pairings">
                  {pairingCores.map((c) => {
                    const coreMembers = data.operators
                      .filter((op) => op.alliances.includes(c.alliance) && !isBanned(op.operator))
                      .sort(byTier);
                    if (coreMembers.length === 0) return null;
                    return (
                      <div key={c.alliance} className="gm-co-pairing">
                        <span className="gm-co-label gm-co-pairinglabel">
                          <em>Good With</em>
                          <Badge name={c.alliance} icon={c.icon} />
                          <span className="gm-co-labelname">{c.alliance}</span>
                          {isomorphBadge(c.alliance)}
                        </span>
                        <div className="gm-co-roster">
                          {coreMembers.map((op) => (
                            <span key={op.operator} className="gm-co-facewrap">
                              {opFace(op, 'gm-co-member', op.alliances.includes(a) ? a : undefined, c.alliance)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })}


      {/* Straight under the bundles, the pivot picture: every reachable operator
          serving an alliance you are NOT already building, its alliance names
          under the face, so what is left to pursue is one look. Shown from Tier III
          on regardless of whether anything has locked in -- Tier I and II stay
          bare, the same "no wrong choices yet" rule the rest of that band follows,
          since a face marked "helps any alliance" is itself a kind of steer the
          opening rounds do not have. */}

      {/* The units whose value does not hang on an alliance, and separately, which
          shop item turns one of them into a member of an alliance you are running.
          Peeked one tier ahead of the shop, same as the bundles: nobody needs
          Entelechia named at Tier III, but the Tier V pick worth saving Funds for
          is worth knowing about while still shopping at Tier IV. */}
      {band > 1 && freeFaces.length > 0 && (
        <div className="gm-co-block">
          {/* No heading. "Free choice" sat directly above a tag reading "Helps any
              alliance", which says the same thing in words a player can act on, and
              every other block on this screen earns its heading by naming an alliance
              the tags below it cannot. */}
          <div className="gm-co-acts">
            <div className="gm-co-act">
              <span className="gm-co-acttag">Helps any alliance</span>
              <span className="gm-co-actbody">
                <span className="gm-co-actfaces">
                  {/* No extra class, ever -- specifically never the core-lock
                      greying the shelf applies. These operators are worth
                      having regardless of which Core wins, so a Core locking
                      or settling must not dim them the way it dims a stale
                      star/thumb elsewhere. */}
                  {freeFaces.map((op) => opFace(
                    op, '', undefined, undefined, undefined,
                    filterAlliance ? ISOMORPH_FACE_TARGETS[filterAlliance]?.[op.operator] : undefined,
                  ))}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Drawn whenever nothing is being viewed -- settled run or not.
          It used to vanish the moment a Core settled, which made sense while it was
          the Recommended row: advice about what to aim for has nothing left to say
          once the run has aimed. It is not advice any more. It is how the player
          records what the shop dealt them, and the shop keeps dealing after the
          commitment. Losing it at the exact moment the run got interesting left
          nowhere to mark a Tier V pickup except by reopening a bundle.

          It DOES step aside for an open alliance, though: the two were never meant
          to be read at once, and a bundle sitting directly above its own shelf of
          Tier VI pickups was answering "what does this alliance have" and "what
          should I buy right now" in the same breath. Return (in the strip above)
          is what brings it back. */}
      {!filterAlliance && (
      <div className="gm-co-acts">
        {newPlayerMode ? (
          <div className="gm-co-act" style={vt('act', 'the-shelf')}>
            <p className="gm-co-tip" role="status">
              {newPlayerCores.length === 0
                ? 'If you\u2019re a new player, it would be ideal to pick core alliances to play and switch around when you\u2019re done playing them. Try choosing up to three now. The tool will then advise who you should borrow.'
                : 'The first 20 highlighted are who you should borrow, the rest are not possible unless you have available slots.'}
            </p>
            {newPlayerCores.length > 0 && (
              <span className="gm-co-actbody">
                <span className="gm-co-actfaces">
                  {newPlayerPool.map((op, i) => opFace(op, i >= NEW_PLAYER_CAP ? 'gm-co-stale' : ''))}
                </span>
              </span>
            )}
            {newPlayerOverflow > 0 && (
              <p className="gm-co-newplayer-overflow">
                +{newPlayerOverflow} more beyond the first {NEW_PLAYER_CAP}, greyed out above.
              </p>
            )}
          </div>
        ) : fullyCommitted ? (
          <div className="gm-co-act" style={vt('act', 'the-shelf')}>
            {/* Recommended and Filler, side by side rather than stacked -- Filler
                is routinely the longer list once the run is this deep in, and a
                block that size sitting permanently under Recommended pushed
                everything below it down the screen for a list most presses
                never needed to read. */}
            <span className="gm-co-tierpick">
              <button
                type="button"
                className={`gm-co-tierbtn${!fillerView ? ' current' : ''}`}
                aria-pressed={!fillerView}
                onClick={() => withShift(() => setFillerView(false))}
              >
                {bt(language, 'recommended', 'Recommended')}
              </button>
              <button
                type="button"
                className={`gm-co-tierbtn${fillerView ? ' current' : ''}`}
                aria-pressed={fillerView}
                onClick={() => withShift(() => setFillerView(true))}
              >
                {bt(language, 'filler', 'Filler')}
              </button>
            </span>
            <span className="gm-co-actbody">
              <span className="gm-co-actfaces">
                {fillerView
                  ? massShelfFiller.map((op) => opFace(op, `gm-co-stale${view.thumbs ? '' : ' gm-co-nothumb'}`))
                  : massShelfRecommended.map((op) => opFace(op, view.thumbs ? '' : ' gm-co-nothumb'))}
              </span>
            </span>
          </div>
        ) : (
          <div className="gm-co-act" style={vt('act', 'the-shelf')}>
            {/* Where "Recommended" used to be. One tier at a time, because the window is
                a phone screen over a game: six tiers stacked is a scroll, and the tier
                you are being dealt is the only one you can act on.

                LVL I draws the picker too, with its single button. It used to fall back
                to a plain label on the reasoning that one option is not a choice, and
                that is true, but it made the control change shape between the first
                band and every other one: a wide word at LVL I, a row of small squares
                from LVL II on. In a window read at a glance, a control that moves and
                resizes as you step through the bands has to be found again each time.
                One button, already pressed, says the same thing the label said and
                says it in the place the eye has learned to look. */}
            <span className="gm-co-tierrow">
              {/* A toggle, not a filter: pressed, it replaces the shelf below with
                  every operator marked so far, any tier -- the question "what do I
                  already have" does not care which tier the shop happens to be on
                  right now. Left of the tier tabs, since it is a different kind of
                  question from "which tier", not one more answer among them. */}
              <button
                type="button"
                className={`gm-co-tierbtn gm-co-ownedbtn${ownedOpen ? ' current' : ''}`}
                aria-pressed={ownedOpen}
                aria-label={ownedOpen ? 'Hide owned operators' : 'Show every operator marked so far'}
                onClick={() => withShift(toggleOwned)}
              >
                {bt(language, 'owned', 'Owned')}
              </button>
              <span className="gm-co-tierpick">
                {view.tiers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`gm-co-tierbtn${!ownedOpen && t === shownTier ? ' current' : ''}`}
                    aria-pressed={!ownedOpen && t === shownTier}
                    aria-label={`Show LVL ${t}`}
                    onClick={() => withShift(() => { setOwnedOpen(false); setTierPick(t); })}
                  >
                    {t}
                  </button>
                ))}
              </span>
            </span>
            <span className="gm-co-actbody">
              <span className="gm-co-actfaces">
                {ownedOpen
                  ? ownedOps.map((op) => opFace(op))
                  : shelf.map((op) => opFace(
                    op,
                    `${unadvised(op) ? ' unadvised' : ''}${isGreyedByCoreLock(op) ? ' gm-co-stale' : ''}${view.thumbs ? '' : ' gm-co-nothumb'}`.trim(),
                  ))}
              </span>
            </span>
          </div>
        )}
      </div>
      )}

      {/* Everything marked so far, one face each, stuck to the window's foot,
          the run's own receipt. In mark order, newest on the right, and every face
          is the same button it is everywhere else: press it to unmark.

          Titled, because unlabelled it was a row of portraits at the bottom of a
          screen already full of portraits, and nothing said these were the ones
          you had.

          Gated on ITS OWN contents, not on the mark count: with the run's Core open,
          every mark can be on screen already and the bar would otherwise sit there
          empty under a heading and a zero. */}

      </>)}
      {activeHint === 'tips' && (
        <OnboardingHint
          targetRef={tipsBtnRef}
          containerRef={rootRef}
          zoom={zoom}
          language={language}
          text="If you feel confident from here, you can turn off tips from now on."
          onDismiss={() => dismissHint('tips')}
        />
      )}
      {activeHint === 'descriptions' && (
        <OnboardingHint
          targetRef={descBtnRef}
          containerRef={rootRef}
          zoom={zoom}
          language={language}
          text="Descriptions can bloat up the interface of this helper, turn it off when you're ready to stop seeing it."
          onDismiss={() => dismissHint('descriptions')}
        />
      )}
    </div>
  );

  /* The companion page renders the screen AS the page: it is where a phone lands
     and what the popup fallback opens, and neither wants a button in front of it. */
  if (standalone) return screen;

  /*
   * The whole component, rendered where the link used to be.
   *
   * On Chromium the pop-out is a window this page owns, because Document
   * Picture-in-Picture gives the opener the document, so the page that offers it is
   * the page that draws it, and the click that opens it asked for it. Where
   * that API does not exist the same button opens the companion page in a small
   * window.open popup (a desktop Safari or Firefox), or simply navigates to it (a
   * phone, where a popup the size of the screen is just a worse tab).
   */
  return (
    <>
      {mode === 'page' ? (
        <Link prefetch={false} href={COMPANION_PAGE} className="gm-toplanner">
          <b>Stronghold Companion ›</b>
          <em>A small companion app that keeps track of your run and recommends operators, from Kukkikaze&rsquo;s own experience of the mode.</em>
        </Link>
      ) : (
        /* Two ways to open it, offered rather than chosen.
           This used to decide on the reader's behalf: Picture-in-Picture where the API
           existed, a plain window everywhere else. That is the right default and the
           wrong rule, because the two suit different setups and only the reader knows
           which they have. Above the game is what you want on one screen, where
           anything else would cover it. A tab is what you want on a second monitor,
           where nothing covers anything and having the whole screen matters more than
           being on top.
           Only offered where it exists: without Document Picture-in-Picture the first
           button would be a button that does nothing, so it is not drawn. */
        <div className={`gm-toplanner gm-co-launch${pip.isOpen ? ' current' : ''}`}>
          {/* The copy on the left, the two ways in on the right. Wrapped so the text
              can be a column beside them instead of the buttons sitting underneath it
              across the whole width of the page. */}
          <span className="gm-co-launchsay">
            {/* What KIND of thing this is. It sits on a page of reference tables and is
                the one item on it that DOES something. */}
            <b><span className="gm-co-launchkind">Tool</span>Stronghold Companion</b>
          {/* "Open the companion" named a thing nobody had met. This says what it is
              FOR, and whose opinion it is. The picks are a playbook, not a solver, and
              a reader should know that before taking one. */}
          <em>A small companion app that keeps track of your run and recommends operators, from Kukkikaze&rsquo;s own experience of the mode.</em>
          </span>
          <span className="gm-co-launchrow">
            {mode === 'pip' && (
              <button
                type="button"
                /* The same outline as New tab beside it. It used to be filled, to
                   say which of the two to take, but the pair are alternatives rather
                   than a recommendation and a step: which one suits you depends on
                   whether you have a second screen, which the button cannot know. A
                   solid teal block also read as already-on rather than as emphasis.
                   What says it is OPEN is `current` on the card and this button's own
                   label turning to Close, neither of which was ever the fill. */
                className={`gm-co-launchbtn${pip.isOpen ? ' current' : ''}`}
                title="Picture-in-Picture: a small window the system keeps above the game, so it stays readable while you play."
                onClick={() => {
                  if (pip.isOpen) { pip.close(); return; }
                  /* This press is the launch: the window opens clean, on Step 1,
                     whatever the last run left behind. Nothing here is derived from the
                     setup state. Doing that shut the panel the instant the last pool
                     was tapped and threw the player into the run mid-thought. Setup
                     closes when it is finished. */
                  resetRun();
                  setStep(0);
                  setSetupOpen(true);
                  pip.open();
                }}
              >
                {pip.isOpen ? 'Close' : (
                  <>
                    {/* A small pane resting over a larger one: the window that sits on
                        top of what you are doing. */}
                    <svg viewBox="0 0 16 14" width="15" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                      <rect x="0.9" y="0.9" width="14.2" height="12.2" rx="1.4" opacity="0.55" />
                      <rect x="7.6" y="6.6" width="7" height="5.9" rx="1.1" fill="currentColor" fillOpacity="0.22" />
                    </svg>
                    On top
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              className="gm-co-launchbtn"
              title="An ordinary browser tab, which you can drag to another screen. It will not stay above the game."
              onClick={openTab}
            >
              {/* A window with a tab riding its top edge: the browser you already have,
                  with one more in it. */}
              <svg viewBox="0 0 18 14" width="16" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                <rect x="0.9" y="4.2" width="16.2" height="8.9" rx="1.3" opacity="0.55" />
                <path d="M8.7 4.2 V2.2 a1.1 1.1 0 0 1 1.1 -1.1 H15.4 a1.1 1.1 0 0 1 1.1 1.1 V4.2" fill="currentColor" fillOpacity="0.22" />
              </svg>
              New tab
            </button>
          </span>
        </div>
      )}
      {mode === 'tab' && (
        <p className="hint gm-co-away">Always-on-top is unavailable in this browser.</p>
      )}
      {/* role=status: the error appears in answer to a press whose focus stays on
          the button, so without a live region the refusal is silent. */}
      {pip.error && <p className="hint gm-co-away gm-co-failed" role="status">{pip.error}</p>}
      {pip.isOpen && (
        /* The one thing a player has to know. The window is drawn by this page, so
           the page closing takes it with it. */
        <p className="hint gm-co-away gm-co-failed">
          Leave this tab open &mdash; the companion is drawn by it.
        </p>
      )}
      <PipWindow host={pip.host}>{pip.isOpen ? screen : null}</PipWindow>
    </>
  );
}
