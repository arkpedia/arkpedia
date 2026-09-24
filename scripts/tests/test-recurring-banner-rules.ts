// The recurring Standard/Kernel banner rules are a plain Node test, also run alone by
// `npm run test:banners`. Importing it here registers the same tests under `npm test`,
// which is the suite CI and the release job run.
import './test-recurring-banners.mjs';
