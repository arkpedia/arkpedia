# Event home previews

The event cosmetic catalogue is in `config/event-cosmetic-previews.json`. Use the game's activity and cosmetic IDs with the official announcement. For a paid pack, use the announced pack name. For a standalone background, include the canonical event name so older published pages can find it. A layout manifest enables the clickable **Preview UI** entry. A scene on its own enables **Preview background**. Regional cosmetic data supplies localized names and sprite overrides when available.

Keep the unpacked `home_page.ab`, `common.ab`, theme and background bundles from the same client release, along with that release's `hot_update_list.json`. The exporter verifies the checksums against the manifest. With the Python dependencies in `scripts/content/requirements.txt` installed, run this from the app root.

```sh
python scripts/imports/export_home_preview.py /path/to/unpacked /path/to/hot_update_list.json \
  --theme tm_redvelvet_1 --background bg_redvelvet_1
```

Use `--discover` to batch-export the new home themes and backgrounds in the supplied bundle directory. The client manifest supplies the IDs and checksums. Existing exports are left in place, including any manually composed ones. Use the individual flags to refresh a specific export.

Use `--breaking-news` to include the default promo and caption from the matching `ui_home_act_banner_shop_h2_0.ab` bundle. For an event-specific promo, pass `--news-banner BUNDLE SPRITE TITLE` using its manifest path and exact sprite name. Hunt uses `spritepack/ui_home_act_banner_gacha_en_0.ab` and `picLinkage_en_42_0_5`. Pass `--locale en` for the Global progress label. The Hunt sanity digits use the atlas linked by the character-view prefab, and the Terminal uses the prefab’s soft mask. Use `--assistant "Tragodia" /path/to/base.webp --assistant-frame 144 47 1040` to place the reference assistant at that position in the 1280 × 720 canvas. Use `--assistant-dialogue` with the localized game-data voice line. Hunt uses Violet Mizutsune Orchid’s Appointed as Assistant line (`char_1048_orchd2`, `CN_001`), confirmed on the Global home screen. The dialogue panel uses the game’s tiled sprite. The export preserves the font aliases for English text and profile numbers. The web viewer uses Roboto Condensed and Manrope when the corresponding client typefaces are unavailable locally.

The command writes the projected layout and WebP sprites to `public/event-preview/<theme-id>/` and the assembled artwork to `public/event-preview/<background-id>/background.webp`. Use the theme directory as `theme.layout.artRoot` and its `layout.json` as `theme.layout.manifest`. Point `scene.image` at the exported background. Supply the soundtrack only when its in-game ID is confirmed. The shared WebGL player uses a background's `scene.json` when its particle export is available. Persona's specialized rig still has its own exporter.

Export effects from the background prefab and its shared shader and texture bundles. The exporter follows Unity file references and reads the active emitter hierarchy, burst timing, materials, meshes and texture sheets. It samples particle simulation and trails for browser playback. Celebration's two persistent bloom emitters use the room's hierarchy scale to keep their glow around the artwork's light sources.

```sh
python scripts/imports/export_home_particles.py /path/to/bg_anniversary_1.ab public/event-preview/bg_anniversary_1 \
  --room-scale-emitter 'bd (1)' --room-scale-emitter 'bd (2)' --dependencies /path/to/dependencies/*.ab
```

Refresh the exported-cosmetic index from the game display tables after importing art. A pack picks up a preview automatically when the index has its background and theme and its announced contents or game unlock descriptions identify them. Pass both regional tables to match the official names and unlock descriptions in each region. The optional audio table matches an exported `music.m4a` to the room's music ID and bank. Use the curated catalogue for standalone event rewards and previews with additional configuration.

```sh
python scripts/imports/build_home_cosmetic_catalogue.py public/event-preview config/discovered-home-cosmetics.json \
  /path/to/cn/display_meta_table.json /path/to/en/display_meta_table.json \
  --audio-table /path/to/en/audio_data.json \
  --omit bg_p3r_1 tm_p3r_1 bg_anniversary_1 bg_redvelvet_1 tm_redvelvet_1
```

Strike Camp uses the opening 30 seconds of the Global `m_avg_victorianormal_loop` clip. The audio table names it Cloudy Day and assigns it to `sys.ON_MUSIC.bg_hunter_1`. The unpacked bundle is `audio/sound_beta_2/music/avg/m_avg_victorianormal.ab` (MD5 `d022a5af98c12f544cdc3781de16f0f2`, Global client `26-11-19-09-03-43_d30fff`).

Persona uses the opening 30 seconds of the audio clip identified under `music.gameData`. The identical waveform in the Apple Music excerpt starts about 45 seconds into the game clip. The page loads the game excerpt as a first-party preview and links to the published soundtrack.

A future gallery can read `homePreviewCatalogue()` from `lib/home/previews.ts` to list available backgrounds and themes by their stable game IDs. Themes with one known companion background expose its ID. Call `getHomePreview(backgroundId, themeId)` for a particular combination or `getHomePreview(undefined, themeId)` to use the game’s default room. Pass the result to `HomeCosmeticPreview` from `components/home/HomeCosmeticPreview.tsx`. The viewer uses the selected background’s effects and music. The catalogue only exposes imported cosmetics with a renderable layout or room image.

Check the preview from the event page at desktop and mobile widths. Verify art loading, mouse movement, drag and Ctrl/Cmd-scroll, reduced motion, and BGM with the event music setting enabled. Run `npx tsx --test scripts/tests/test-event-home-cosmetics.ts` to check catalogue matching and committed artwork.

## Automatic import

The **Import and review home previews** workflow checks the CN and Global client versions from the `arkpedia-data` imports branch every six hours. It runs the exporter when those version records change. The importer pins each display and audio table to a mirror commit, verifies that its game version matches the recorded client, and checks every downloaded Unity bundle against the game's manifest.

The importer chooses Global art when it can render a complete home screen. It keeps the previous Global export during a temporary missing or broken Global supply, and uses CN for new cosmetics until a Global export is available. A Global name can arrive before its art. New themes use the same sample Amiya profile and Breaking News slot, and reuse the game's own sprites, text positions and colors. The room import follows the BGM bank and exports the opening game audio when the source clip is available. The known Hunt, Persona, Theatre and Celebration presentations keep their reviewed assets and existing regional overrides.

Browser checks open every generated layout and room at desktop and phone widths alongside those four references. The workflow uploads the version receipt, bundle checksums and any items needing individual review. A successful browser run also uploads screenshots and a binary patch for the checked assets and catalogue. Apply that patch to its recorded app revision and use the regular checked Cloudflare Preview workflow. The import job has read-only permissions and leaves publication to that workflow.

To replay the process locally, run the importer against a temporary copy of the catalogue and asset directory. The optional `--only` flag limits a review to named game IDs. The `--snapshots` flag accepts a directory per region containing `manifest.json`, `display_meta_table.json`, `audio_data.json` and the extracted bundles. Supply the pinned Amiya portrait with `--assistant-art` for offline replay. Use `npm run test:browser -- tests/browser/home-preview.spec.ts --project desktop --project mobile` to verify the staged site with the standard browser configuration.
