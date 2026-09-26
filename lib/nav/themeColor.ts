/**
 * The browser-chrome colour (`<meta name="theme-color">`) for each theme: the page's
 * own --bg from styles/core/shared.css, so a phone's URL bar continues the page.
 *
 * Kept as constants rather than read from the stylesheet because the boot script in
 * _document runs before any CSS is parsed. scripts/tests/test-ui-tokens.ts fails if
 * these drift from the --bg values in shared.css.
 */
export const THEME_COLOR = {
  dark: '#0f151b',
  light: '#F1F3F5',
} as const;
