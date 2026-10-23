import js from '@eslint/js';
import next from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * Flat config (ESLint 9). `next lint` is gone in Next 16, so this replaced .eslintrc.json and
 * scripts/.eslintrc.json. Two configs live here, as they did before: the site's Next rules for
 * pages/components/lib, and a plainer Node set for scripts/ -- the Next preset is scoped away
 * from scripts/ rather than teaching React rules to a build script.
 */

/** Keep private client state inside its module instead of exporting debug globals. */
const PRIVATE_STATE = {
  selector: "AssignmentExpression[left.property.name=/^__/][left.property.name!='__assetRetry']",
  message: 'Keep private client state inside its module instead of exporting debug globals.',
};

/**
 * Pages that render on the server at the request's moment and hydrate in the reader's browser
 * later, so they may not read the clock: a render that does fails hydration (React #418/#423/#425)
 * once the two clocks disagree. They take the request's `now` (contentPageClock, CLOCK_UNITS in
 * lib/content/pageClock.ts) and useReaderClock(now) after mount (lib/time/readerClock.ts).
 */
const NO_CLOCK = 'This page renders on the server at the request\'s moment and hydrates in the reader\'s browser later, so it may not read the clock here: a render that does fails hydration (React #418/#423/#425) once the two clocks disagree. Take the request\'s `now` prop (contentPageClock, CLOCK_UNITS in lib/content/pageClock.ts) and useReaderClock(now) after mount (lib/time/readerClock.ts).';

const CLOCK_PAGES = [
  'pages/index.tsx',
  'pages/operators/index.tsx',
  'pages/skins.tsx',
  'pages/gacha-simulator.tsx',
  'pages/stages/index.tsx',
  'pages/stages/all.tsx',
  'pages/stages/browse.tsx',
  'pages/stages/regular.tsx',
  'pages/stages/supplies.tsx',
  'pages/schedule.tsx',
  'pages/farming.tsx',
  'pages/obtain-method.tsx',
  'pages/enemies/index.tsx',
  'pages/games/color-palette.tsx',
  'pages/games/music-guesser.tsx',
  'pages/operator-planner.tsx',
  'pages/community-hub.tsx',
  'pages/skin-planner.tsx',
  'pages/reward-tracker.tsx',
  'pages/artists.tsx',
  'pages/voice-actors.tsx',
  'components/operators/CreditDatabase.tsx',
  'components/schedule/EventsPanel.tsx',
  'components/home/GachaBannersPanel.tsx',
];

/* What `eslint scripts` linted under ESLint 8: .js files, plus the files its overrides named
   (*.cjs, content/test-runtime.mjs). ESLint 9 lints every matched extension, and turning it on
   for the .ts and .mjs scripts (125 findings, none new) is its own change, not part of this
   upgrade. */
const SCRIPTS = ['scripts/**/*.js', 'scripts/**/*.cjs', 'scripts/content/test-runtime.mjs'];

export default [
  // The Next preset, scoped away from scripts/ (entries without `files` are global ignores and
  // must keep them, or scripts would be ignored outright).
  // An entry with only `ignores` is a global ignore and stays as it is; every other entry, with
  // `files` or without (the plugin's rules apply everywhere otherwise), skips scripts/.
  ...next.map((entry) => (Object.keys(entry).length === 1 && entry.ignores ? entry : { ...entry, ignores: [...(entry.ignores ?? []), 'scripts/**'] })),

  { ignores: ['lib/vendor/**', '.next/**', '.open-next/**', '.wrangler/**', '.cache/**', 'out/**', 'build/**'] },

  // ESLint 8 did not report a disable directive that matched nothing; ESLint 9 does, by default,
  // as an error. This codebase carries directives for rules that later stopped firing.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },

  {
    // The site's rules, which use the Next and React plugins: not for scripts/ (above).
    ignores: ['scripts/**'],
    rules: {
      '@next/next/no-img-element': 'warn',
      'no-restricted-syntax': ['error', PRIVATE_STATE],
      // Next 16's preset turns on the React Compiler rule suite at error level. That is a
      // migration of its own -- 284 findings across 133 refs and 109 setState-in-effect sites,
      // none of them new bugs, all of them how the codebase was written before the compiler
      // existed. Held at 'off' so this branch keeps the lint signal it had on Next 14; adopting
      // them is a follow-up, not a config flag to flip inside a hosting spike.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },

  {
    files: CLOCK_PAGES,
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: NO_CLOCK },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: NO_CLOCK },
        {
          selector: "CallExpression[callee.name=/^(toServerTime|serverWeekday)$/][arguments.length=0]",
          message: 'Called with no argument this reads the clock; pass the moment explicitly (e.g. serverWeekday(new Date(clock)) with clock from useReaderClock).',
        },
        PRIVATE_STATE,
      ],
    },
  },

  {
    files: SCRIPTS,
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-condition': ['error', { checkLoops: false }],
      // Node's own globals now include `crypto`, which ESLint 8's node env did not: a script's
      // `const crypto = require('crypto')` is a local binding, not a redeclaration.
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  { files: ['scripts/**/*.cjs'], languageOptions: { sourceType: 'script' } },
  {
    files: ['scripts/content/test-runtime.mjs', 'scripts/palettes/palette-review/review.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
