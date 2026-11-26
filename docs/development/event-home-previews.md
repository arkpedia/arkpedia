# Event home previews

The event cosmetic catalogue is in `config/event-cosmetic-previews.json`. Use the game's activity and cosmetic IDs with the official announcement. For a paid pack, use the announced pack name. For a standalone background, include the canonical event name so older published pages can find it. A layout manifest enables the clickable **Preview UI** entry. A scene on its own enables **Preview background**. Regional cosmetic data supplies localized names and sprite overrides when available.

Keep the unpacked `home_page.ab`, `common.ab`, theme and background bundles from the same client release, along with that release's `hot_update_list.json`. The exporter verifies the checksums against the manifest. With the Python dependencies in `scripts/content/requirements.txt` installed, run this from the app root.

```sh
python scripts/imports/export_home_preview.py /path/to/unpacked /path/to/hot_update_list.json \
  --theme tm_redvelvet_1 --background bg_redvelvet_1
```

Use `--breaking-news` to include the default promo and caption from the matching `ui_home_act_banner_shop_h2_0.ab` bundle. Use `--assistant "Tragodia" /path/to/base.webp --assistant-frame 144 47 1040` to place the reference assistant at that position in the 1280 × 720 canvas.

The command writes the projected layout and WebP sprites to `public/event-preview/<theme-id>/` and the assembled artwork to `public/event-preview/<background-id>/background.webp`. Use the theme directory as `theme.layout.artRoot` and its `layout.json` as `theme.layout.manifest`. Point `scene.image` at the exported background. Supply the soundtrack only when its in-game ID is confirmed. The shared WebGL player uses a background's `scene.json` when its particle export is available. Persona's specialized rig still has its own exporter.

Export effects from the background prefab and its shared shader and texture bundles. The exporter follows Unity file references and reads the active emitter hierarchy, burst timing, materials, meshes and texture sheets. It samples particle simulation and trails for browser playback. Celebration's two persistent bloom emitters use the room's hierarchy scale to keep their glow around the artwork's light sources.

```sh
python scripts/imports/export_home_particles.py /path/to/bg_anniversary_1.ab public/event-preview/bg_anniversary_1 \
  --room-scale-emitter 'bd (1)' --room-scale-emitter 'bd (2)' --dependencies /path/to/dependencies/*.ab
```

Refresh the exported-cosmetic index from the game display tables after importing art. A pack picks up a preview automatically when the index has its background and theme and its announced contents or game unlock descriptions identify them. The optional names file holds the official English names for Strike Camp and Hunt pending the corresponding Global display table. Use the curated catalogue for standalone event rewards and previews with additional configuration.

```sh
python scripts/imports/build_home_cosmetic_catalogue.py public/event-preview config/discovered-home-cosmetics.json \
  /path/to/display_meta_table.json --names config/home-cosmetic-names.json \
  --omit bg_p3r_1 tm_p3r_1 bg_anniversary_1 bg_redvelvet_1 tm_redvelvet_1
```

Persona uses the opening 30 seconds of the audio clip identified under `music.gameData`. The identical waveform in the Apple Music excerpt starts about 45 seconds into the game clip. The page loads the game excerpt as a first-party preview and links to the published soundtrack.

Check the preview from the event page at desktop and mobile widths. Verify art loading, mouse movement, drag and Ctrl/Cmd-scroll, reduced motion, and BGM with the event music setting enabled. Run `npx tsx --test scripts/tests/test-event-home-cosmetics.ts` to check catalogue matching and committed artwork.
