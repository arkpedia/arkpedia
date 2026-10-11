# Patreon supporters

Edit [`config/patreon_supporters.json`](../../config/patreon_supporters.json) to update the acknowledgements on `/support`. This is the source file; the page contains no separate list of names.

The `supporter-tier` array sets the displayed tier order, highest to lowest: Oiler, Giant, Delicious, Cookie, Mini. Each tier has a stable `id`, a heading in `name`, and a `supporters` array of display names. Names appear in the order written, including non-Latin characters. Add or remove names and tiers directly in this file, using valid JSON with no trailing commas.

The file is imported when the site builds. Commit and deploy an edit through the normal release checks to update the live page; the local development preview updates automatically.
