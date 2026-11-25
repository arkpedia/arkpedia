# Event home previews

The event cosmetic catalogue is in `config/event-cosmetic-previews.json`. Use the game's activity and cosmetic IDs with the official announcement. For a paid pack, use the announced pack name. For a standalone background, include the canonical event name so older published pages can find it. A layout manifest enables the clickable **Preview UI** entry. A scene on its own enables **Preview background**. Regional cosmetic data supplies localized names and sprite overrides when available.

Keep the unpacked `home_page.ab`, `common.ab`, theme and background bundles from the same client release, along with that release's `hot_update_list.json`. The exporter verifies the checksums against the manifest. With the Python dependencies in `scripts/content/requirements.txt` installed, run this from the app root.

```sh
python scripts/imports/export_home_preview.py /path/to/unpacked /path/to/hot_update_list.json \
  --theme tm_redvelvet_1 --background bg_redvelvet_1
```

Use `--breaking-news` to include the default promo and caption from the matching `ui_home_act_banner_shop_h2_0.ab` bundle. Use `--assistant "Tragodia" /path/to/base.webp --assistant-frame 144 47 1040` to place the reference assistant at that position in the 1280 × 720 canvas.

The command writes the projected layout and WebP sprites to `public/event-preview/<theme-id>/` and the assembled artwork to `public/event-preview/<background-id>/background.webp`. Use the theme directory as `theme.layout.artRoot` and its `layout.json` as `theme.layout.manifest`. Point `scene.image` at the exported background. Supply the soundtrack only when its in-game ID is confirmed. When available, a separately exported WebGL scene can be registered as `scene.native` to play the background's custom effects. Persona's specialized rig, shaders and particles use the same layout renderer.

Persona uses the opening 30 seconds of the audio clip identified under `music.gameData`. The identical waveform in the Apple Music excerpt starts about 45 seconds into the game clip. The page loads the game excerpt as a first-party preview and links to the published soundtrack.

Check the preview from the event page at desktop and mobile widths. Verify art loading, mouse movement, drag and Ctrl/Cmd-scroll, reduced motion, and BGM with the event music setting enabled. Run `npx tsx --test scripts/tests/test-event-home-cosmetics.ts` to check catalogue matching and committed artwork.
