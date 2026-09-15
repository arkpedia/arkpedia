/**
 * Where the Enemies section opens, for links inside the app.
 *
 * /enemies is not a page. The handbook IS the frame on /enemies/<slug> -- a grid of
 * every enemy beside whichever one is open -- so the section is reached through a
 * redirect declared in next.config.js.
 *
 * next/link cannot follow that redirect. A redirect in next.config.js is served by
 * the server; the client router only knows the routes in its manifest, so
 * `<Link href="/enemies">` made it request /_next/static/chunks/pages/enemies.js,
 * get a 404, and fall back to `window.location` -- a full document load. The section
 * still opened on the right enemy, which is why it looked like it worked, but the
 * whole app restarted on the way: the window scroll reset, and the music player's
 * iframe was destroyed mid-song, leaving the widget collapsed at its initial state.
 *
 * So in-app links go straight to the entry page. The slug is the same one the
 * redirect uses -- next.config.js reads it out of public/enemies-index.json and
 * inlines it here at build time -- so the two cannot drift apart if handbook order
 * ever changes.
 */
const entry = process.env.NEXT_PUBLIC_ENEMY_HANDBOOK_ENTRY;

/** The href to link to. Falls back to /enemies (a reload, but never a dead link). */
export const ENEMY_HANDBOOK_HREF = entry ? `/enemies/${entry}` : '/enemies';

/**
 * What that link's active state matches on. The href is one enemy's page, but the
 * nav entry stands for the whole section, so highlighting has to test the section
 * rather than the destination.
 */
export const ENEMY_HANDBOOK_SECTION = '/enemies';
