import type { JSX } from 'react';
import Image from '@/components/content/ContentImage';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BannerConfig, BannerType } from '@/lib/gacha/gachaTypes';
import { ratesAtPull } from '@/lib/gacha/gachaEngine';

// Draws `count` star icons in a row -- used throughout the FAQ modal
// so "6★" reads as six drawn stars rather than a number-plus-glyph.
function Stars({ count }: { count: number }) {
  return (
    <span className="gacha-stars-icons" aria-label={`${count} star`} role="img">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
          <path d="M10 1 L12.7 7.6 L19.8 8.3 L14.4 13 L16 20 L10 16.3 L4 20 L5.6 13 L0.2 8.3 L7.3 7.6 Z" />
        </svg>
      ))}
    </span>
  );
}

function TutorialRarityRow({ items }: { items: { n: number; content: JSX.Element }[] }) {
  return (
    <div className="gacha-tutorial-rarity-row">
      {items.map((item) => (
        <div key={item.n} className="gacha-tutorial-rarity-col">
          <Stars count={item.n} />
          {item.content}
        </div>
      ))}
    </div>
  );
}

function BasicsPageRarities() {
  return (
    <TutorialRarityRow
      items={[
        { n: 6, content: <span className="gacha-tutorial-pct">2%</span> },
        { n: 5, content: <span className="gacha-tutorial-pct">8%</span> },
        { n: 4, content: <span className="gacha-tutorial-pct">50%</span> },
        { n: 3, content: <span className="gacha-tutorial-pct">40%</span> },
      ]}
    />
  );
}

function BasicsPageFeaturedSplits() {
  const splits: Record<number, number[][]> = {
    6: [[50, 50], [35, 35, 30], [25, 25, 25, 25]],
    5: [[50, 50], [25, 25, 50], [16.7, 16.7, 16.7, 50]],
    4: [[50, 50]],
  };
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="gacha-tutorial-splits">
      <div className="gacha-tutorial-splits-row">
        {[6, 5, 4].map((n) => {
          const variants = splits[n];
          const row = variants[step % variants.length];
          return (
            <div key={n} className="gacha-tutorial-rarity-col">
              <Stars count={n} />
              <div className="gacha-tutorial-split-row">
                {row.map((v, i) => (
                  <span key={i} className={`gacha-tutorial-split-chip${i === row.length - 1 ? ' off-banner' : ''}`}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="gacha-tutorial-footnote">Highlighted numbers are the featured operator(s)&apos; share; the last number is the off-banner share.</p>
    </div>
  );
}

function BasicsPageRampUp() {
  const [pull, setPull] = useState(48);
  useEffect(() => {
    const id = setInterval(() => setPull((p) => (p >= 65 ? 48 : p + 1)), 1100);
    return () => clearInterval(id);
  }, []);
  const rates = ratesAtPull(pull);
  const isRamping = pull > 50;
  return (
    <div className="gacha-tutorial-ramp">
      <div className={`gacha-tutorial-ramp-pull${isRamping ? ' ramping' : ''}`}>
        Pull #{pull}
        {isRamping && ' (soft pity)'}
      </div>
      <TutorialRarityRow
        items={[
          { n: 6, content: <span className="gacha-tutorial-pct">{(rates.six * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 5, content: <span className="gacha-tutorial-pct">{(rates.five * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 4, content: <span className="gacha-tutorial-pct">{(rates.four * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 3, content: <span className="gacha-tutorial-pct">{(rates.three * 100).toFixed(isRamping ? 2 : 0)}%</span> },
        ]}
      />
    </div>
  );
}

// Two scenarios -- a low and a high starting pull count -- each doing
// the same build-up -> reset-to-0 -> count-up -> fade-out cycle, so
// it's clear the reset happens no matter how high the counter climbed
// first, not just for small numbers.
const RESET_SEQUENCES: { label: string; values: number[] }[] = [
  { label: 'Low pull count', values: [4, 5, 6, 7, 0, 1, 2, 3] },
  { label: 'High pull count', values: [45, 46, 47, 48, 0, 1, 2, 3] },
];
const RESET_HOLD_STEPS = 2; // extra steps to hold the fade-out before switching scenario

function BasicsPageReset() {
  const cycleLength = RESET_SEQUENCES[0].values.length + RESET_HOLD_STEPS;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (cycleLength * RESET_SEQUENCES.length)), 550);
    return () => clearInterval(id);
  }, []);
  const scenarioIndex = Math.floor(step / cycleLength) % RESET_SEQUENCES.length;
  const localStep = step % cycleLength;
  const seq = RESET_SEQUENCES[scenarioIndex];
  const inSequence = localStep < seq.values.length;
  const isFading = !inSequence;
  const isResetMoment = localStep === 4;
  const count = inSequence ? seq.values[localStep] : seq.values[seq.values.length - 1];
  return (
    <div className={`gacha-tutorial-reset${isResetMoment ? ' hit' : ''}${isFading ? ' fading' : ''}`}>
      <span className="gacha-tutorial-reset-sublabel">{seq.label}</span>
      {isResetMoment ? (
        <>
          <Stars count={6} />
          <span className="gacha-tutorial-reset-label">Obtained! Resets.</span>
        </>
      ) : (
        <span className="gacha-tutorial-reset-label">Pulls since last 6★: {count}</span>
      )}
    </div>
  );
}

// Measures the actual horizontal center of each of `count` box
// elements relative to their shared container, so a floating chip can
// be positioned exactly above whichever box it's "at" -- guessing a
// fixed percentage (e.g. 25%/75%) breaks as soon as the row isn't
// perfectly symmetric, which it usually isn't once separators like
// "‹ shared ›" (much wider than "✕") are in the mix.
function useBoxCenters(count: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [centers, setCenters] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      setCenters(
        boxRefs.current.map((el) => {
          if (!el) return 0;
          const rect = el.getBoundingClientRect();
          return rect.left - containerRect.left + rect.width / 2;
        })
      );
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [count]);
  const setBoxRef = (i: number) => (el: HTMLDivElement | null) => {
    boxRefs.current[i] = el;
  };
  return { containerRef, setBoxRef, centers };
}

// Slide 0 of BasicsPageCarryover (and reused by Kernel/Standard/
// Orienteering/Joint's own carryover pages) -- concrete pity-counter
// demo showing carryover actually succeeding (counter keeps climbing
// and lands a 6★), the mirror image of the isolated-pity flow's
// rejection. Pass fromLabel/toLabel directly for a genuine
// cross-category link (e.g. Standard -> Orienteering); repeatLabel is
// a shorthand for the same-category case (e.g. Featured -> Next
// Featured).
function CarryoverPityDemo({ repeatLabel, fromLabel, toLabel }: { repeatLabel?: string; fromLabel?: string; toLabel?: string }) {
  const left = fromLabel ?? repeatLabel ?? 'Featured';
  const right = toLabel ?? `Next ${repeatLabel ?? 'Featured'}`;
  const frames = [
    { pos: 0, value: 48, obtained: false },
    { pos: 0, value: 48, obtained: false },
    { pos: 1, value: 48, obtained: false },
    { pos: 1, value: 50, obtained: false },
    { pos: 1, value: 53, obtained: false },
    { pos: 1, value: 53, obtained: true },
    { pos: 1, value: 53, obtained: true },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % frames.length), 1200);
    return () => clearInterval(id);
  }, []);
  const frame = frames[step];
  const { containerRef, setBoxRef, centers } = useBoxCenters(2);
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className={`gacha-tutorial-pity-chip${frame.obtained ? ' obtained' : ''}`} style={{ left: centers ? centers[frame.pos] : 0, opacity: centers ? 1 : 0 }}>
        {frame.obtained ? 'Obtained 6★!' : `Pity: ${frame.value}`}
      </div>
      <div className="gacha-tutorial-pity-flow-row two">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box linked">
          {left}
        </div>
        <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box linked">
          {right}
        </div>
      </div>
    </div>
  );
}

// Slide 1 of TwoSlideCarryoverDemo -- a chip that bounces from the
// first banner type to the second and back once, showing pity is
// genuinely shared both ways rather than a one-time transfer, then
// holds in place for the rest of this slide's display time. Remounts
// fresh (and so re-plays) each time TwoSlideCarryoverDemo cycles back
// to this slide.
const CARRYOVER_BOUNCE_POSITIONS = [0, 1, 0];

function CarryoverBouncingPair({ pairLeft, pairRight }: { pairLeft: string; pairRight: string }) {
  const { containerRef, setBoxRef, centers } = useBoxCenters(2);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= CARRYOVER_BOUNCE_POSITIONS.length - 1) return;
    const id = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(id);
  }, [step]);
  const pos = CARRYOVER_BOUNCE_POSITIONS[step];
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className="gacha-tutorial-pity-chip obtained" style={{ left: centers ? centers[pos] : 0, opacity: centers ? 1 : 0 }}>
        Pity
      </div>
      <div className="gacha-tutorial-pity-flow-row two">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box linked">
          {pairLeft}
        </div>
        <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box linked">
          {pairRight}
        </div>
      </div>
    </div>
  );
}

// A simpler 2-slide version of the carryover demo (pity demo, then a
// bouncing chip over the static shared pair) for banner types that
// don't need a third "isolated" slide -- currently Kernel, Standard,
// Orienteering, and Joint Operation. demoFromLabel/demoToLabel let the
// pity-demo slide show a genuine cross-category link (e.g. Standard ->
// Orienteering) instead of the same-category repeatLabel shorthand.
function TwoSlideCarryoverDemo({
  repeatLabel,
  pairLeft,
  pairRight,
  demoFromLabel,
  demoToLabel,
}: {
  repeatLabel?: string;
  pairLeft: string;
  pairRight: string;
  demoFromLabel?: string;
  demoToLabel?: string;
}) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 2), 5700);
    return () => clearInterval(id);
  }, []);
  if (slide === 1) {
    return <CarryoverBouncingPair pairLeft={pairLeft} pairRight={pairRight} />;
  }
  return <CarryoverPityDemo repeatLabel={repeatLabel} fromLabel={demoFromLabel} toLabel={demoToLabel} />;
}

function BasicsPageCarryover() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 5700);
    return () => clearInterval(id);
  }, []);

  if (slide === 1) {
    return (
      <div className="gacha-tutorial-carryover">
        <div className="gacha-tutorial-carryover-shared-label">Share pity together:</div>
        <div className="gacha-tutorial-carryover-isolated-row">
          {['Featured', 'Standard', 'Joint Operation', 'Orienteering', 'The Front That Was'].map((name) => (
            <div key={name} className="gacha-tutorial-carryover-box shared">
              {name}
            </div>
          ))}
        </div>
        <div className="gacha-tutorial-carryover-pair">
          <div className="gacha-tutorial-carryover-box">Kernel</div>
          <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
          <div className="gacha-tutorial-carryover-box">Kernel Locating</div>
        </div>
      </div>
    );
  }
  if (slide === 2) {
    return (
      <div className="gacha-tutorial-carryover">
        <div className="gacha-tutorial-carryover-isolated-label">No carryover between or within these:</div>
        <div className="gacha-tutorial-carryover-isolated-row">
          {['Limited', 'Crossover', 'Celebration'].map((name) => (
            <div key={name} className="gacha-tutorial-carryover-box isolated">
              {name}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <CarryoverPityDemo />;
}

// A single mini pull-result card, reusing the real simulator's own
// slide-in-and-glow animation classes so this preview actually looks
// like a Pull x10 reveal -- just with a rarity label instead of an
// operator portrait, and no reliance on any specific operator's icon.
function TutorialPullCard({ rarity, index }: { rarity: 5 | 6 | 4 | 3; index: number }) {
  const slideDirection = index % 2 === 0 ? 'gacha-pull-slide-bottom' : 'gacha-pull-slide-top';
  const isHighlight = rarity === 5 || rarity === 6;
  return (
    <div key={index} className={`gacha-tutorial-pull-card${isHighlight ? ' highlight' : ''} ${slideDirection}`}>
      {isHighlight ? (
        <>
          <Stars count={1} />
          <span className="gacha-tutorial-pull-card-label">{rarity}★</span>
        </>
      ) : (
        <span className="gacha-tutorial-pull-card-label dim">{rarity}★</span>
      )}
    </div>
  );
}

// Four illustrative Pull x10 outcomes, all satisfying "at least one
// 5★-or-higher in the first 10" in different ways -- cycles through
// them on a loop, replaying the slide-in reveal each time.
const FIRST_TEN_SCENARIOS: (5 | 6 | 4 | 3)[][] = [
  [3, 4, 3, 4, 5, 4, 3, 4, 3, 4],
  [4, 5, 3, 4, 5, 3, 4, 5, 4, 3],
  [3, 4, 3, 3, 4, 6, 4, 3, 4, 3],
  [4, 3, 5, 4, 3, 4, 6, 3, 4, 3],
];

function BasicsPageFirstTen() {
  const [scenario, setScenario] = useState(0);
  useEffect(() => {
    // Changing every card's key at once is enough to force React to
    // unmount and remount all 10 in the same render, replaying the
    // slide-in animation together -- no need to briefly empty the grid
    // first, which was causing it to collapse and re-center each cycle.
    const id = setInterval(() => setScenario((s) => (s + 1) % FIRST_TEN_SCENARIOS.length), 2200);
    return () => clearInterval(id);
  }, []);
  const results = FIRST_TEN_SCENARIOS[scenario];
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">First 10 Pulls</div>
      <div className="gacha-tutorial-pull-grid">
        {results.map((rarity, i) => <TutorialPullCard key={`${scenario}-${i}`} rarity={rarity} index={i} />)}
      </div>
    </div>
  );
}

function BasicsPageSixStarGuarantee() {
  return (
    <div className="gacha-tutorial-guarantee-examples">
      <span className="gacha-tutorial-guarantee-chip">Standard / Kernel · 150 and 300 pulls</span>
      <span className="gacha-tutorial-guarantee-chip">Featured · 150 pulls without the featured 6★</span>
      <span className="gacha-tutorial-guarantee-chip">Limited: 300-pull free copy</span>
      <span className="gacha-tutorial-guarantee-chip">Crossover: 120-pull guarantee</span>
    </div>
  );
}

// Fixed closing celebration image. Lazy, as every image but a page's hero: it is
// put in with the guide's last page and is on screen then, so it loads at once.
const BASICS_DONE_IMAGE = "/six-star-skins/Wiš'adel - I am Wiš'adel.webp";

function BasicsPageDone() {
  return (
    <div className="gacha-tutorial-done-row">
      <Image src={BASICS_DONE_IMAGE} alt="Wiš'adel" width={120} height={120} className="gacha-tutorial-done-image" />
      <span className="gacha-tutorial-done-thumb">👍</span>
    </div>
  );
}

export const BASICS_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: BasicsPageRarities, text: 'The simulator starts with a 2% chance for a 6★, 8% for a 5★, 50% for a 4★ and 40% for a 3★.' },
  { Visual: BasicsPageFeaturedSplits, text: 'Depending on the type of banner, the chance of the featured six stars, five stars and four stars can be different.' },
  {
    Visual: BasicsPageRampUp,
    text: 'When you do not pull for a six star within 50 pulls, each subsequent pull adds 2 percentage points to the 6★ chance. The other rarities become proportionally less likely.',
  },
  { Visual: BasicsPageReset, text: 'The counter gets reset whenever you have obtained a six star.' },
  {
    Visual: BasicsPageCarryover,
    text: "This 'pity' counter can get carried over on certain banners: Featured, Standard, Joint Operation, Orienteering and The Front That Was share 6★ pity, while kernel and kernel locating share pity separately from that group. Every other banner type is isolated. Please check on the specific banner tutorials to understand this better.",
  },
  { Visual: BasicsPageFirstTen, text: 'Every banner guarantees at least 1 five star or higher rarity in the first 10 pulls.' },
  {
    Visual: BasicsPageSixStarGuarantee,
    text: 'Certain banners have guarantee systems for six stars. Please check on the specific banner tutorials to understand this better.',
  },
  { Visual: BasicsPageDone, text: "That's all the basics that every banner of this game have!" },
];

// Same six-star roster used by Celebration's tutorial, reused here so
// Orienteering has real referenceable operators too instead of Greek
// letters standing in for nothing in particular.
const SIX_STAR_SHOWCASE_OPERATORS = ['Bagpipe', 'Aak', 'Nightingale', 'Passenger', 'Saria', 'Surtr'];
const ORIENTEERING_FIVE_OPERATORS = ['Blue Poison', 'Lappland', 'Specter', 'Platinum', 'Mayer', 'Glaucus'];
const ORIENTEERING_SIX_PICKED = [0, 2, 4];
const ORIENTEERING_FIVE_PICKED = [1, 3, 5];

function sixStarIconPath(name: string): string {
  return `/six-star-icons/${name} - Base.webp`;
}
function fiveStarIconPath(name: string): string {
  return `/five-star-icons/${name} - Base.webp`;
}

function OrienteeringPageSixSelection() {
  const totalSteps = 4; // 3 reveals + 1 hold, then loop
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const revealed = Math.min(step, 3);
  const showResult = step >= 3;
  return (
    <div className="gacha-tutorial-orienteering-row">
      {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
        const order = ORIENTEERING_SIX_PICKED.indexOf(i);
        const picked = order !== -1 && order < revealed;
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            {showResult && picked && <span className="gacha-tutorial-pick-pct">33.3%</span>}
          </div>
        );
      })}
    </div>
  );
}

// Unlike six-stars, the 3 NOT chosen still stay pullable here -- just
// at reduced weight -- so this animates two distinct reveal groups:
// the 3 chosen (60% shared, "picked") and the 3 remaining (40% shared,
// "included" -- a lighter highlight showing they're still live, just
// not preferred).
function OrienteeringPageFiveSelection() {
  const totalSteps = 7; // 3 chosen reveals + 3 remaining reveals + 1 hold, then loop
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const chosenRevealed = Math.min(step, 3);
  const remainingRevealed = Math.max(0, Math.min(step - 3, 3));
  const showResult = step >= 6;
  const remainingIndices = ORIENTEERING_FIVE_OPERATORS.map((_, i) => i).filter((i) => !ORIENTEERING_FIVE_PICKED.includes(i));
  return (
    <div className="gacha-tutorial-orienteering-row">
      {ORIENTEERING_FIVE_OPERATORS.map((name, i) => {
        const isChosen = ORIENTEERING_FIVE_PICKED.includes(i);
        const chosenOrder = ORIENTEERING_FIVE_PICKED.indexOf(i);
        const chosenShown = isChosen && chosenOrder < chosenRevealed;
        const remainingOrder = remainingIndices.indexOf(i);
        const remainingShown = !isChosen && remainingOrder !== -1 && remainingOrder < remainingRevealed;
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${chosenShown ? ' picked' : remainingShown ? ' included' : ''}`}>
            <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            {showResult && chosenShown && <span className="gacha-tutorial-pick-pct">20%</span>}
            {showResult && remainingShown && <span className="gacha-tutorial-pick-pct dim">13.3%</span>}
          </div>
        );
      })}
    </div>
  );
}

const ORIENTEERING_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: OrienteeringPageSixSelection,
    text: 'Choose 3 out of 6 six stars. They are the only ones pullable on the banner.',
  },
  {
    Visual: OrienteeringPageFiveSelection,
    text: 'Choose 3 out of 6 five stars as well. They take up 60% chance shared equally. The remaining 3 five stars are also pullable, sharing 40%.',
  },
  {
    Visual: () => <TwoSlideCarryoverDemo pairLeft="Standard" pairRight="Orienteering" demoFromLabel="Standard" demoToLabel="Orienteering" />,
    text: '6-star pity ramp up is shared with Featured and Standard banners -- it carries over between them, not isolated to this banner alone.',
  },
];

// A left-facing shopping trolley -- marks which of the selected
// six-star/five-star picks the player chose to make shop-buyable.
function TrolleyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" className="gacha-tutorial-trolley-icon" style={{ transform: 'scaleX(-1)' }}>
      <path d="M2 3h2l1.5 9h9L17 6H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14" cy="16" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Kernel Locating shows the same 6 showcase operators per rarity as
// Orienteering, plus a "+6" marker since there are actually 12
// candidates of each rarity -- drawing all 12 would be excessive for
// an illustrative example. One picked six-star and one picked
// five-star show the trolley icon, marking them as the ones chosen to
// also be shop-buyable.
function KernelLocatingPageSelection() {
  const totalSteps = 7;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const sixRevealed = Math.min(step, 3);
  const fiveRevealed = Math.max(0, Math.min(step - 3, 3));
  return (
    <div className="gacha-tutorial-orienteering">
      <div className="gacha-tutorial-orienteering-row">
        {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
          const order = ORIENTEERING_SIX_PICKED.indexOf(i);
          const picked = order !== -1 && order < sixRevealed;
          const isShopPick = order === 0 && picked;
          return (
            <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
              <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              {isShopPick && <TrolleyIcon />}
            </div>
          );
        })}
        <div className="gacha-tutorial-pick-slot more">
          <span className="gacha-tutorial-pick-more">+6</span>
        </div>
      </div>
      <div className="gacha-tutorial-orienteering-row">
        {ORIENTEERING_FIVE_OPERATORS.map((name, i) => {
          const order = ORIENTEERING_FIVE_PICKED.indexOf(i);
          const picked = order !== -1 && order < fiveRevealed;
          const isShopPick = order === 0 && picked;
          return (
            <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
              <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              {isShopPick && <TrolleyIcon />}
            </div>
          );
        })}
        <div className="gacha-tutorial-pick-slot more">
          <span className="gacha-tutorial-pick-more">+6</span>
        </div>
      </div>
    </div>
  );
}

const KERNEL_LOCATING_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: KernelLocatingPageSelection,
    text: 'Choose 2 out of 12 six stars and 3 out of 24 five stars. You may choose which 6 stars and 5 stars are buyable in shop for 180 and 45 gold certs respectively.',
  },
  {
    Visual: KernelPageSplit,
    text: 'The 2 selected six stars share a 50% chance, and the 3 five stars also share their own 50% chance. The remainder of 6 stars and 5 stars remain in the off banner pool.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: KernelPageCarryover, text: '6-star pity ramp up can be inherited from a previous kernel locating or kernel banner or passed into future similar banners.' },
];

function JointPageFeatured() {
  const sixOps = SIX_STAR_SHOWCASE_OPERATORS.slice(0, 4);
  const fiveOps = ORIENTEERING_FIVE_OPERATORS;
  return (
    <div className="gacha-tutorial-orienteering">
      <div className="gacha-tutorial-orienteering-row">
        {sixOps.map((name) => (
          <div key={name} className="gacha-tutorial-pick-slot picked">
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-pct">25%</span>
          </div>
        ))}
      </div>
      <div className="gacha-tutorial-orienteering-row">
        {fiveOps.map((name) => (
          <div key={name} className="gacha-tutorial-pick-slot picked">
            <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-pct">16.7%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const JOINT_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: JointPageFeatured,
    text: 'There are four featured six stars and 6 featured five stars, they will be the only ones pullable on the banner.',
  },
  {
    Visual: () => <TwoSlideCarryoverDemo pairLeft="Standard" pairRight="Joint Operation" demoFromLabel="Standard" demoToLabel="Joint Operation" />,
    text: '6-star pity ramp up is shared with Featured and Standard banners -- it carries over between them, not isolated to this banner alone.',
  },
];

const CELEBRATION_INITIALLY_OWNED = [0, 3];

function CelebrationPagePool() {
  return (
    <div className="gacha-tutorial-orienteering-row">
      {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
        const owned = CELEBRATION_INITIALLY_OWNED.includes(i);
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${owned ? ' owned' : ' picked'}`}>
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-status">{owned ? 'Owned' : 'Available'}</span>
          </div>
        );
      })}
    </div>
  );
}

function CelebrationPageBlowOpen() {
  const [phase, setPhase] = useState(0); // 0 = before, 1 = obtaining, 2 = after
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 3), 2300);
    return () => clearInterval(id);
  }, []);
  const justObtained = 2;
  return (
    <div className="gacha-tutorial-celebration-pool">
      <div className="gacha-tutorial-orienteering-row">
        {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
          let cls = 'picked';
          let status = 'Available';
          if (phase === 0) {
            if (CELEBRATION_INITIALLY_OWNED.includes(i)) {
              cls = 'owned';
              status = 'Owned';
            }
          } else if (phase === 1) {
            if (i === justObtained) {
              cls = 'just-obtained';
              status = 'Obtained!';
            } else if (CELEBRATION_INITIALLY_OWNED.includes(i)) {
              cls = 'owned';
              status = 'Owned';
            }
          }
          // phase 2 ("after"): every slot -- including the one just
          // obtained -- goes back to Available. Nothing stays excluded,
          // which is exactly why pulling further risks a duplicate.
          return (
            <div key={i} className={`gacha-tutorial-pick-slot ${cls}`}>
              <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              <span className="gacha-tutorial-pick-status">{status}</span>
            </div>
          );
        })}
      </div>
      <p className="gacha-tutorial-footnote">
        {phase === 0 ? 'Before: some already owned.' : phase === 1 ? 'You pull and obtain a new six star!' : 'After: pool fully reopens -- even the one you just got.'}
      </p>
    </div>
  );
}

function IsolatedPityFlowDemo({ label }: { label: string }) {
  // Two independent chips: "a" is the original 30-pity counter that
  // gets rejected and settles back at Previous Banner for good --
  // never moving again -- while "b" is a brand new counter that fades
  // in fresh at the current banner afterward and does the rest of the
  // journey on its own. Using one chip for both halves made it look
  // like the same counter was physically traveling back and forth.
  const steps: {
    a: { pos: number; value: number; shake: boolean };
    b: { pos: number; value: number; shake: boolean; visible: boolean; fizzling: boolean };
  }[] = [
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 1, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 1, value: 30, shake: true }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 3, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 5, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 8, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: true, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: true, fizzling: true } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: false, fizzling: false } },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 1200);
    return () => clearInterval(id);
  }, []);
  const frame = steps[step];
  const { containerRef, setBoxRef, centers } = useBoxCenters(3);
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className={`gacha-tutorial-pity-chip${frame.a.shake ? ' shake' : ''}`} style={{ left: centers ? centers[frame.a.pos] : 0, opacity: centers ? 1 : 0 }}>
        Pity: {frame.a.value}
      </div>
      <div
        className={`gacha-tutorial-pity-chip${frame.b.shake ? ' shake' : ''}${frame.b.fizzling ? ' fizzling' : ''}`}
        style={{ left: centers ? centers[frame.b.pos] : 0, opacity: centers && frame.b.visible ? 1 : 0 }}
      >
        Pity: {frame.b.value}
      </div>
      <div className="gacha-tutorial-pity-flow-row">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box">
          Previous Banner
        </div>
        <span className="gacha-tutorial-pity-flow-x">✕</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box celebration">
          {label}
        </div>
        <span className="gacha-tutorial-pity-flow-x">✕</span>
        <div ref={setBoxRef(2)} className="gacha-tutorial-pity-flow-box">
          Future Banner
        </div>
      </div>
    </div>
  );
}

const CELEBRATION_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: CelebrationPagePool, text: 'Your first 6★ is an operator you do not own from the banner’s listed pool, if one is available. If you already own everyone, the whole pool is eligible from the start.' },
  {
    Visual: CelebrationPageBlowOpen,
    text: 'After you have obtained a new six star, all other six stars that you own will become available in the pool again so do not pull beyond the first six star.',
  },
  {
    Visual: () => <IsolatedPityFlowDemo label="Celebration" />,
    text: '6-star pity ramp up is isolated, starts from 0 for this banner and does not carry over to any future banners.',
  },
];

function KernelPageSplit() {
  return (
    <TutorialRarityRow
      items={[
        {
          n: 6,
          content: (
            <div className="gacha-tutorial-split-list">
              <div className="gacha-tutorial-split-row">
                <span className="gacha-tutorial-split-chip">25%</span>
                <span className="gacha-tutorial-split-chip">25%</span>
              </div>
              <span className="gacha-tutorial-footnote">2 featured, share 50%</span>
            </div>
          ),
        },
        {
          n: 5,
          content: (
            <div className="gacha-tutorial-split-list">
              <div className="gacha-tutorial-split-row">
                <span className="gacha-tutorial-split-chip">16.7%</span>
                <span className="gacha-tutorial-split-chip">16.7%</span>
                <span className="gacha-tutorial-split-chip">16.7%</span>
              </div>
              <span className="gacha-tutorial-footnote">3 featured, share 50%</span>
            </div>
          ),
        },
      ]}
    />
  );
}

// Fixed illustrative example -- deliberately NOT derived from the
// currently-selected banner, so this tutorial page keeps showing the
// same reference image regardless of which/how many kernel banners
// get added later.
// Fixed illustrative example -- deliberately NOT derived from the
// currently-selected banner, so this tutorial page keeps showing the
// same reference image regardless of which/how many banners of this
// type get added later.
const KERNEL_EXAMPLE_IMAGE = '/headhunting-banner-images/Kernel 57 (Global).webp';
const STANDARD_EXAMPLE_IMAGE = '/headhunting-banner-images/Standard Pool 171 (Global).webp';

function KernelPageShopOperator() {
  return (
    <div className="gacha-tutorial-kernel-shop">
      <div className="gacha-tutorial-kernel-shop-image-wrap">
        <Image src={KERNEL_EXAMPLE_IMAGE} alt="Kernel banner example" width={280} height={140} style={{ objectFit: 'cover', width: '100%', height: 'auto' }} />
      </div>
      <div className="gacha-tutorial-kernel-shop-legend">
        <p>
          <Stars count={6} /> Center -- Shop Operator (180 gold certificates)
        </p>
        <p>
          <Stars count={5} /> Leftmost -- Shop Operator (45 gold certificates)
        </p>
      </div>
    </div>
  );
}

function KernelPageAdvisory() {
  return (
    <div className="gacha-tutorial-advisory-row">
      <span className="gacha-tutorial-advisory-bad">✕ Spending pulls here</span>
      <span className="gacha-tutorial-advisory-good">✓ Spending gold certificates</span>
    </div>
  );
}

function KernelPageCarryover() {
  return <TwoSlideCarryoverDemo repeatLabel="Kernel" pairLeft="Kernel Locating" pairRight="Kernel" />;
}

const KERNEL_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: KernelPageSplit, text: 'Each featured 6★ has a 25% chance when you pull a 6★. The three featured 5★ operators together account for half of all 5★ pulls.' },
  {
    Visual: KernelPageShopOperator,
    text: 'The center six star is the shop operator, buyable for 180 gold certificates. The leftmost five star is also the shop operator, buyable for 45 gold certificates.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: KernelPageCarryover, text: '6-star pity ramp up can be inherited from a previous kernel locating or kernel banner or passed into future similar banners.' },
];

// Standard's tutorial mimics Kernel's own page structure entirely --
// its own split (page 1) and advisory (page 3) pages are literally the
// same components Kernel uses, since the underlying mechanics are the
// same shape; only the shop-operator page (2) and carryover page (4)
// have Standard-specific content.
function StandardPageShopOperator() {
  return (
    <div className="gacha-tutorial-kernel-shop">
      <div className="gacha-tutorial-kernel-shop-image-wrap">
        <Image src={STANDARD_EXAMPLE_IMAGE} alt="Standard banner example" width={280} height={140} style={{ objectFit: 'cover', width: '100%', height: 'auto' }} />
      </div>
      <div className="gacha-tutorial-kernel-shop-legend">
        <p>
          <Stars count={6} /> Elite 0 version -- Shop Operator (180 gold certificates)
        </p>
        <p>
          <Stars count={5} /> Middle of the three -- Shop Operator (45 gold certificates)
        </p>
      </div>
    </div>
  );
}

function StandardPageCarryover() {
  return <TwoSlideCarryoverDemo repeatLabel="Standard" pairLeft="Featured" pairRight="Standard" />;
}

const STANDARD_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: KernelPageSplit, text: 'Each featured 6★ has a 25% chance when you pull a 6★. The three featured 5★ operators together account for half of all 5★ pulls.' },
  {
    Visual: StandardPageShopOperator,
    text: 'The Elite 0 version six star is the shop operator, buyable for 180 gold certificates. The five star in the middle of the three is also the shop operator, buyable for 45 gold certificates.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: StandardPageCarryover, text: '6-star pity ramp up can be inherited from a previous featured or standard banner, or passed into future similar banners.' },
];

// Featured only ever has a single featured six-star (always 50/50 with
// off-banner), but the five-star slot varies banner to banner between
// exactly 1 or exactly 2 featured five-stars -- cycles between those
// two real shapes rather than showing an invented average.
function FeaturedPageSplit() {
  const fiveVariants = [[50, 50], [25, 25, 50]];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 2200);
    return () => clearInterval(id);
  }, []);
  const fiveRow = fiveVariants[step % fiveVariants.length];
  return (
    <div className="gacha-tutorial-splits">
      <div className="gacha-tutorial-splits-row">
        <div className="gacha-tutorial-rarity-col">
          <Stars count={6} />
          <div className="gacha-tutorial-split-row">
            <span className="gacha-tutorial-split-chip">50</span>
            <span className="gacha-tutorial-split-chip off-banner">50</span>
          </div>
        </div>
        <div className="gacha-tutorial-rarity-col">
          <Stars count={5} />
          <div className="gacha-tutorial-split-row">
            {fiveRow.map((v, i) => (
              <span key={i} className={`gacha-tutorial-split-chip${i === fiveRow.length - 1 ? ' off-banner' : ''}`}>
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="gacha-tutorial-rarity-col">
          <Stars count={4} />
          <div className="gacha-tutorial-split-row">
            <span className="gacha-tutorial-split-chip">50</span>
            <span className="gacha-tutorial-split-chip off-banner">50</span>
          </div>
        </div>
      </div>
      <p className="gacha-tutorial-footnote">Highlighted numbers are the featured operator(s)&apos; share; the last number is the off-banner share.</p>
    </div>
  );
}

// Pulls 141-150 land no six-star at all -- protection is now active,
// but the next batch shows the guarantee only kicks in whenever the
// next six-star actually lands (here pull 155), not forced exactly at
// 150, and that six-star is automatically the featured one.
const FEATURED_150_FILLER: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 3, 4, 4, 3];
const FEATURED_AFTER_150: (5 | 6 | 4 | 3)[] = [4, 3, 4, 3, 6];

function FeaturedPageProtection() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 2), 2400);
    return () => clearInterval(id);
  }, []);

  if (phase === 1) {
    return (
      <div className="gacha-tutorial-first-ten">
        <div className="gacha-tutorial-first-ten-title">
          Pulls 151-155 <span className="gacha-tutorial-pity-inline">Protection active</span>
        </div>
        <div className="gacha-tutorial-pull-grid">
          {FEATURED_AFTER_150.map((rarity, i) => (
            <TutorialPullCard key={`p1-${i}`} rarity={rarity} index={i} />
          ))}
        </div>
        <span className="gacha-tutorial-guarantee-label triggered">Next 6★ = guaranteed featured</span>
      </div>
    );
  }
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">
        Pulls 141-150 <span className="gacha-tutorial-pity-inline">Pull count: 150</span>
      </div>
      <div className="gacha-tutorial-pull-grid">
        {FEATURED_150_FILLER.map((rarity, i) => (
          <TutorialPullCard key={`p0-${i}`} rarity={rarity} index={i} />
        ))}
      </div>
    </div>
  );
}

const FEATURED_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: FeaturedPageSplit,
    text: 'On ordinary pulls, the featured 6★ accounts for half of all 6★ results. The featured 5★ operators share half of the 5★ results. When a 4★ is featured, its rate-up applies within the 4★ pool.',
  },
  {
    Visual: FeaturedPageProtection,
    text: 'After 150 consecutive pulls without the featured 6★, your next 6★ is guaranteed to be that operator. An earlier featured 6★ restarts the count. This protection can trigger once on this banner.',
  },
  { Visual: StandardPageCarryover, text: '6-star pity ramp up can be inherited from a previous featured or standard banner, or passed into future similar banners.' },
];

function LimitedPageFeaturedSplit() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-pct">35%</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-limited-tag">LIMITED</span>
        <span className="gacha-tutorial-pick-pct">35%</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={5} />
        <span className="gacha-tutorial-pick-pct">50%</span>
      </div>
    </div>
  );
}

// Animates the off-banner card's bar at a baseline height while the 3
// rate-up cards' bars grow to 5x that height and back, looping, to
// make the multiplier visually obvious rather than just stating "5x".
function LimitedPageRateUps() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setGrown((g) => !g), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="gacha-tutorial-rateup-demo">
      <div className="gacha-tutorial-rateup-col">
        <div className="gacha-tutorial-rateup-bar" style={{ height: 16 }} />
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Off-banner</span>
        <span className="gacha-tutorial-pick-pct">1x</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="gacha-tutorial-rateup-col">
          <div className="gacha-tutorial-rateup-bar rateup" style={{ height: grown ? 80 : 16 }} />
          <Stars count={6} />
          <span className="gacha-rate-up-tag">RATE-UP</span>
          <span className="gacha-tutorial-pick-pct">{grown ? '5x' : '1x'}</span>
        </div>
      ))}
    </div>
  );
}

function LimitedPageSameChance() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Same series</span>
      </div>
      <span className="gacha-tutorial-equals">=</span>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Off-banner</span>
      </div>
    </div>
  );
}

// Pulls 281-290 and 291-300 both deliberately contain no natural 5★/6★
// hit -- the whole point of this page is that the guarantee exists
// because the player DIDN'T land the featured limited naturally by
// pull 300, so the reveal at the end has to be the thing that grants
// it. 301-310 then shows pity continuing to climb regardless (the
// guarantee doesn't reset it) until it naturally triggers on its own,
// landing an ordinary (non-limited) 6★.
const LIMITED_300_FILLER_A: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 4, 3, 4, 3];
const LIMITED_300_FILLER_B: (5 | 6 | 4 | 3)[] = [4, 3, 3, 4, 3, 4, 3, 4, 4, 3];
const LIMITED_300_FILLER_C: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 3, 4, 3, 6];

function LimitedPage300Guarantee() {
  const phases = ['a', 'b', 'reveal300', 'c'] as const;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), 2200);
    return () => clearInterval(id);
  }, []);
  const current = phases[phase];

  if (current === 'reveal300') {
    return (
      <div className="gacha-tutorial-first-ten">
        <div className="gacha-tutorial-first-ten-title">
          Pull #300 <span className="gacha-tutorial-pity-inline">Pity: 53</span>
        </div>
        <div className="gacha-tutorial-pull-grid">
          {LIMITED_300_FILLER_B.map((rarity, i) => (
            <TutorialPullCard key={`b-${i}`} rarity={rarity} index={i} />
          ))}
        </div>
        <div className="gacha-tutorial-guarantee-row">
          <div className="gacha-tutorial-pull-card highlight small">
            <Stars count={1} />
            <span className="gacha-tutorial-pull-card-label">6★</span>
          </div>
          <span className="gacha-tutorial-guarantee-label">+1 Limited Guarantee</span>
        </div>
      </div>
    );
  }

  const label = current === 'a' ? 'Pulls 281-290' : current === 'b' ? 'Pulls 291-300' : 'Pulls 301-310';
  const results = current === 'a' ? LIMITED_300_FILLER_A : current === 'b' ? LIMITED_300_FILLER_B : LIMITED_300_FILLER_C;
  const pity = current === 'a' ? 43 : current === 'b' ? 53 : null;
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">
        {label}
        {pity !== null && <span className="gacha-tutorial-pity-inline">Pity: {pity}</span>}
      </div>
      <div className="gacha-tutorial-pull-grid">
        {results.map((rarity, i) => (
          <TutorialPullCard key={`${current}-${i}`} rarity={rarity} index={i} />
        ))}
      </div>
      {current === 'c' && <span className="gacha-tutorial-guarantee-label triggered">Pity triggered naturally!</span>}
    </div>
  );
}

function LimitedPageSparkStore() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Current featured</span>
        <span className="gacha-tutorial-pick-pct">300</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Older limited</span>
        <span className="gacha-tutorial-pick-pct">200</span>
      </div>
      <div className="gacha-tutorial-pick-slot owned">
        <Stars count={5} />
        <span className="gacha-tutorial-pick-status">Not recommended</span>
        <span className="gacha-tutorial-pick-pct">75</span>
      </div>
    </div>
  );
}

const LIMITED_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: LimitedPageFeaturedSplit,
    text: 'There are two featured six stars, one of them being limited each taking 35% of the six stars odds. One featured five star takes up 50% of the five stars odds.',
  },
  {
    Visual: LimitedPageRateUps,
    text: 'When returning limited operators have a rate-up, each has five times the weight of an ordinary off-banner 6★. Check Banner details for this run’s lineup.',
  },
  {
    Visual: LimitedPageSameChance,
    text: 'Other limited operators of the same series can be pullable but they take the same chance as every other remaining off-banner.',
  },
  {
    Visual: LimitedPage300Guarantee,
    text: 'At 300 pulls, you will be given a copy of the featured limited 6 star regardless of whether you have an earlier copy before. This only happens once. It also does not affect the 6 star pity accumulated.',
  },
  {
    Visual: LimitedPageSparkStore,
    text: 'The current featured six stars along with limiteds of the same series are obtainable in the spark store for either 300 or 200 sparks (older limited six stars get the 200 treatment). The featured 5 star is available for 75 sparks but is not recommended to be bought.',
  },
  {
    Visual: () => <IsolatedPityFlowDemo label="Limited" />,
    text: 'Limited banner pity is isolated and can never be inherited from a previous banner or passed into future banners.',
  },
];

function SelectionExample() {
  return <div className="gacha-tutorial-guarantee-examples">
    <span className="gacha-tutorial-guarantee-chip">150 pulls → next 6★ is A or B</span>
    <span className="gacha-tutorial-guarantee-chip">300 pulls → next 6★ is the other</span>
  </div>;
}

function TrioRates() {
  return <TutorialRarityRow items={[
    { n: 6, content: <span>Featured trio · 100%</span> },
    { n: 5, content: <span>Featured trio · 60%</span> },
    { n: 4, content: <span>Featured trio · 45%</span> },
  ]} />;
}

const TRIO_PAGES = [
  { Visual: TrioRates, text: 'Every 6★ is one of the three featured operators, with an equal chance for each. Among 5★ pulls the featured trio shares 60%. Among 4★ pulls the featured trio shares 45%. Other operators of those two rarities can also appear.' },
  { Visual: () => <TwoSlideCarryoverDemo pairLeft="Standard" pairRight="The Front That Was" demoFromLabel="Standard" demoToLabel="The Front That Was" />,
    text: 'The Front That Was shares ordinary 6★ pity with Standard Headhunting. All three featured 6★ operators stay in the pool after you pull one.' },
];

function crossoverGuide(banner: BannerConfig) {
  const pages = [{
    Visual: () => <TutorialRarityRow items={[{ n: 6, content: <span>50% featured</span> }, { n: 5, content: <span>50% featured</span> }]} />,
    text: banner.sixStarGuarantee === 'first120'
      ? 'The featured operator has a 50% chance on each ordinary 6★ pull. You are guaranteed your first copy within 120 pulls, once on this banner.'
      : 'The featured operator has a 50% chance on each ordinary 6★ pull. You are guaranteed a copy within 120 pulls. Each copy you pull restarts that count.',
  }];
  const fiveRules = ['The featured operators share 50% of ordinary 5★ pulls.'];
  if (banner.sixStarGuarantee === 'every120') fiveRules.push('If your first 50 pulls contain no featured 5★, the next 5★ is featured.');
  if (banner.fiveStarFeatured.length === 2) fiveRules.push('Once you pull either featured 5★ for the first time, your next 5★ is the other. This happens once.');
  pages.push({ Visual: () => <Stars count={5} />, text: fiveRules.join(' ') },
    { Visual: () => <IsolatedPityFlowDemo label="Crossover" />, text: '6★ pity starts fresh on this crossover and expires when the banner ends.' });
  return pages;
}

const BANNER_TUTORIAL_PAGES = {
  orienteering: ORIENTEERING_PAGES, celebration: CELEBRATION_PAGES, kernel: KERNEL_PAGES,
  standard: STANDARD_PAGES, limited: LIMITED_PAGES, kernelLocating: KERNEL_LOCATING_PAGES,
  joint: JOINT_PAGES, featured: FEATURED_PAGES, trio: TRIO_PAGES,
} satisfies Record<Exclude<BannerType, 'crossover'>, { Visual: () => JSX.Element; text: string }[]>;

export function bannerTutorialPages(banner: BannerConfig | null) {
  if (!banner) return null;
  if (banner.type === 'crossover') return crossoverGuide(banner);
  if (banner.type === 'kernel' && banner.label.startsWith('Celebration - Kernel')) return [
    { Visual: CelebrationPagePool, text: 'On Celebration – Kernel, your first 6★ is an eligible Kernel operator you do not own, if one is available. Later 6★ pulls use the full eligible pool. The archive simulator does not track your owned operators for these Kernel runs.' },
    { Visual: () => <IsolatedPityFlowDemo label="Celebration" />, text: 'This celebration has its own 6★ pity counter. It starts at zero and expires when the banner ends.' },
  ];
  const pages = BANNER_TUTORIAL_PAGES[banner.type];
  if (banner.type === 'featured' && banner.sixStarGuarantee !== 'focused') return pages.filter(page => page.Visual !== FeaturedPageProtection);
  if (banner.type === 'limited' && banner.sixStarGuarantee !== 'limitedBonus') return pages.filter(page => page.Visual !== LimitedPage300Guarantee);
  if (banner.sixStarGuarantee !== 'selection') return pages;
  const name = banner.type === 'kernel' ? 'Kernel Selection' : 'Standard Selection';
  return [{ Visual: SelectionExample, text: name + ' counts every pull on this banner, including early rate-ups. After 150 total pulls, your next 6★ is one of the two rate-ups. After 300 total pulls, your next 6★ is the other one. Each guarantee triggers once. The selection count resets when this banner ends.' }, ...pages];
}
