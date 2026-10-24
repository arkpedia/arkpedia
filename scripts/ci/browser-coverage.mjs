// Shadow-only: selects existing tests; does not run them or vouch for a Check.
import { createHash } from 'node:crypto';

const CENSUS = 'layout-census.spec.ts';
const AFTER = 'layout-census-after.spec.ts';
const ROUTES = {
  story: /^\/story(?:[/?]|$)/,
  schedule: /^\/(?:schedule|events)(?:[/?]|$)/,
  music: /^\/music(?:[/?]|$)/,
  accounts: /^\/(?:account|base|friends|medals)(?:[/?]|$)/,
};
const ROOT = { story: '/story', schedule: '/schedule', music: '/music', accounts: '/account' };
const normalize = value => value.replace(/\\/g, '/');

/** Consume Playwright's real --list --reporter=json output, including describe paths. */
export function listedCases(report) {
  if (!Array.isArray(report?.suites) || !Array.isArray(report.errors) || report.errors.length) throw new Error('Browser inventory is missing or has collection errors');
  const cases = [];
  function walk(suite, parents = []) {
    const titles = suite.column === 0 ? parents : [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      const file = normalize(spec.file ?? '');
      for (const test of spec.tests ?? []) {
        const titlePath = [...titles, spec.title];
        const project = test.projectName;
        if (!file.endsWith('.spec.ts') || file.startsWith('/') || file.includes('..') || !['desktop', 'mobile', 'after-census'].includes(project)
          || titlePath.some(title => typeof title !== 'string' || /[\r\n›]/.test(title))) throw new Error('Unrepresentable browser inventory entry');
        cases.push({ project, file, titlePath, line: `[${project}] › ${file} › ${titlePath.join(' › ')}` });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  }
  report.suites.forEach(suite => walk(suite));
  if (!cases.length || new Set(cases.map(item => item.line)).size !== cases.length) throw new Error('Empty or ambiguous browser inventory');
  return cases.sort((a, b) => a.line.localeCompare(b.line, 'en'));
}

/** Preserve the census implementation and every registered state/theme/project for affected routes. */
export function coveragePlan(plan, report) {
  const inventory = listedCases(report);
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
  let lane = plan.lane;
  let reason = plan.reason;
  const census = inventory.filter(item => item.file === CENSUS);
  const selectedFiles = new Set(plan.selected.map(file => normalize(file).replace(/^tests\/browser\//, '')));
  const fallback = why => { lane = 'full'; reason = why; };
  if (!['full', 'targeted', 'none'].includes(lane)) throw new Error('Unknown browser plan lane');
  if (lane === 'targeted') {
    const expectedFiles = [...plan.selected, ...plan.omitted].map(file => normalize(file).replace(/^tests\/browser\//, '')).sort();
    const actualFiles = [...new Set(inventory.map(item => item.file))].sort();
    if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) fallback('Browser file inventory differs from the source plan');
    if (!inventory.some(item => item.file === AFTER && item.project === 'after-census')) fallback('Full-census completion contract is missing');
    for (const file of selectedFiles) for (const project of ['desktop', 'mobile']) {
      if (!inventory.some(item => item.file === file && item.project === project)) fallback(`Selected browser file is absent from ${project}: ${file}`);
    }
    for (const domain of plan.domains) {
      if (!ROUTES[domain]) { fallback(`No census route policy for ${domain}`); continue; }
      for (const project of ['desktop', 'mobile']) {
        if (!census.some(item => item.project === project && item.titlePath.at(-1) === `${ROOT[domain]}, dark theme`)) fallback(`Missing ${domain} census at ${project}`);
      }
    }
    if (!census.length || census.some(item => item.titlePath.length !== 1 || !/^\/.*?, (?:dark|light) theme$/.test(item.titlePath[0]))) fallback('Unknown layout census naming contract');
  }
  const affected = item => {
    // A changed specification with no classified runtime domain retains the whole page census.
    if (!plan.domains.length) return true;
    const route = item.titlePath[0].replace(/, (?:dark|light) theme$/, '').split(' (')[0];
    return plan.domains.some(domain => ROUTES[domain]?.test(route));
  };
  const selected = inventory.filter(item => lane === 'full' || lane === 'targeted' && item.file !== AFTER && (selectedFiles.has(item.file) || item.file === CENSUS && affected(item)));
  const selectedLines = new Set(selected.map(item => item.line));
  const omitted = inventory.filter(item => !selectedLines.has(item.line));
  return {
    policy: 'shadow-coverage-v1', lane, reason, inventorySha256: digest,
    reusableCheckProof: false, outcome: 'planned-only',
    census: lane === 'full' ? 'full-with-completion-audit' : lane === 'targeted' ? 'affected-routes-and-all-registered-states' : 'not-run',
    completionAudit: lane === 'full' ? 'included' : 'omitted-requires-full-census',
    selected, omitted, testList: selected.map(item => item.line).join('\n') + (selected.length ? '\n' : ''),
  };
}
