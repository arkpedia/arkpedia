// PR release checks protect reader journeys. Exhaustive visual contracts run in
// Browser audit; omitted identities remain explicit in the existing evidence.
const CORE = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'privacy', 'statistics-prompt'];
const SHARED = ['core', 'navigation-account-redesign', 'credits-games-review', 'music-workspace', 'music-navigation',
  'story-progress', 'base-account', 'reward-import', 'planning-pages'];
const AUDIT = /^(?:layout-census(?:-after)?|motion|tabs|x-buttons|cards-and-headings|row-alignment|on-states|artwork-zoom-contrast|operator-caption-motion)\.spec\.ts$/;
const FAMILIES = [
  [/^(?:music|song)(?:\/|[-.])/, /^(?:music|song)-/],
  [/^(?:account|account-import|cloud-account|friends|medals)(?:\/|[-.])/, /^(?:account-|cloud-accounts|friends|medal-collection|reward-import|music-resume)/],
  [/^story(?:\/|\.)/, /^story-/],
  [/^(?:schedule|events)(?:\/|\.)/, /^(?:schedule-|event-|regional-schedules|banner-forecasts|home-banner-status)/],
  [/^(?:pulls|free-op|skin-planner|planner|planning|recruitment)(?:\/|\.)/, /^(?:pulls|reward-|rewards-projects|skin-planner|planning-pages|planner-|recruitment-)/],
  [/^(?:base|bases)(?:\/|\.)/, /^base-/],
  [/^(?:artists|voice-actors|credits|operators|operator)(?:\/|\.)/, /^(?:credit-|credits-games|operator-|core)/],
  [/^(?:games|minigames|chibi)(?:\/|\.)/, /^(?:credits-games|media-community-games|chibi)/],
  [/^(?:community|home)(?:\/|\.)|^index\./, /^(?:media-community-games|home-|rewards-projects)/],
];
const base = file => file.replaceAll('\\', '/').split('/').at(-1);

export function releaseBrowserPlan(plan, { changes, specs, baselineVerified }) {
  if (!baselineVerified || plan.lane === 'none') return plan;
  const inventory = [...new Set(specs)].sort();
  const selected = new Set();
  const addNames = names => names.every(name => {
    const file = inventory.find(file => base(file) === `${name}.spec.ts`);
    if (file) selected.add(file);
    return !!file;
  });
  if (!addNames(CORE)) return plan;
  const addFamily = pattern => {
    const matching = inventory.filter(file => pattern.test(base(file)) && !AUDIT.test(base(file)));
    matching.forEach(file => selected.add(file));
    return matching.length > 0;
  };
  for (const { path: raw, status } of changes) {
    const path = raw.replaceAll('\\', '/');
    if (/^docs\/|^[^/]+\.md$/.test(path)) continue;
    if (path.startsWith('tests/browser/')) {
      if (!inventory.includes(path) || status?.startsWith('D')) return plan;
      if (!AUDIT.test(base(path))) selected.add(path);
      continue;
    }
    // Toolchain, build policy, data and unclassified runtime changes still use
    // the conservative original plan. This is not a blanket skip switch.
    if (!/^(?:pages|components|lib|styles)\//.test(path)) return plan;
    const relative = path.replace(/^(?:pages|components|lib|styles)\//, '');
    if (/^(?:core|layout|ui|nav|time|content|assets|privacy)\/|^_(?:app|document)\./.test(relative)) {
      if (!addNames(SHARED)) return plan;
      continue;
    }
    const family = FAMILIES.find(([code]) => code.test(relative));
    if (!family) return plan;
    if (!addFamily(family[1])) return plan;
  }
  if (!selected.size || selected.size === inventory.length) return plan;
  return { ...plan, lane: 'targeted', releaseOnly: true, domains: [],
    reason: 'PR release journeys: core navigation/consent plus affected features; exhaustive visual checks run separately',
    selected: [...selected].sort(), omitted: inventory.filter(file => !selected.has(file)) };
}
