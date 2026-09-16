# Operator showcase preview

Local preview branch: `preview/operator-showcase`, based on dev main `ada0c8cb7`.

This revision responds to the operator artwork, section crowding, roster spacing, and planner edit-control feedback. These historical preview notes are retained with the approved work now integrated into `operator-page-update`.

- Artwork gets nearly half the desktop layout and stays above details on mobile. Navigation stays with the information panel.
- Section buttons display only the selected section. Hidden sections remain mounted so edited levels and other control values survive switching. Links and browser history select the corresponding section.
- The information panel scrolls independently on desktop, keeping the artwork, operator identity, and section controls in place. Talents and mastery entries use a single readable column.
- Operator names, rarity, and roster metadata have explicit spacing.
- Planner cards include small “Set current” and “Set goal” labels within the existing buttons.
- The operator introduction is in Overview. Detailed records, physical examination, and voice actors remain in Character information.
- Overview also exposes compact illustrator, original designer (when explicitly credited), and voice-actor credits with icons and language abbreviations. Combined language credits retain both languages; original names and credit aliases are preserved.
- Talents share promotion and potential selectors. Each card shows the applicable effect and requirement badges; locked talents identify their unlock promotion. Description space stays stable across selections, and additional mechanics use “Talent details.”
- The desktop layout fits shorter windows without a fixed minimum height pushing it below the viewport; the details panel scrolls internally. Talent text wraps within its cards. The redundant Artwork navigation option is removed.
- The final workspace fits beneath the actual site navigation height. A bordered information panel separates content from the large artwork, with Arkpedia's existing fonts and theme colors.
- Every available section is accessible from a styled dropdown aligned to the right of the operator name. “More” is removed; Character information is labeled “Profile.” All sections stay in one continuous reading flow; the dropdown jumps to sections, and scrolling updates its current value.
- Skill buttons include S1/S2/S3 labels. Skill headers and Stats controls adapt to panel width, avoiding squeezed or vertical labels. Artwork thumbnails use one scrollable row, and the price remains readable in light mode.
- Enlarged artwork has an accessible dialog name, keyboard focus containment, Escape to close, and focus restoration. Bottom content clearance protects the last controls from the floating music button.

The separate Mastery section, stable skill headers, and planner material ordering from the approved refinement remain intact.

Containment is a layout requirement: controls, text, artwork, and popovers must stay within their available width. Use wrapping and reachable scrolling rather than clipping information. At desktop heights of 600 px or less, the document scrolls naturally so the identity and navigation cannot consume the entire reading area. Search results are capped to the viewport height, including landscape phones, and long result names wrap within the dropdown.

The outer left and right gutters are reserved for potential ads. The entire operator workspace, including search and artwork, is centered and capped at 1040 px. At viewport widths of 1280 px or more, each side reserves at least 160 px plus a 24 px gap. Smaller screens do not reserve side ad rails. Empty ad space does not render placeholder boxes or expand the operator content when no ad is present.


All sections remain visible in document order. Scroll naturally between them, or use the section dropdown to jump directly. The desktop panel and mobile document use native scrolling; no wheel or touch gesture is intercepted to switch tabs.

## Validation

- TypeScript, operator tests (15), and lint passed; lint reports inherited warnings.
- Production build and all 64 server trace checks passed.
- Chromium: 1440, 1024, 390, and 320 px in light and dark themes. Checked section isolation, retained stats inputs, back/forward navigation, mastery-to-skill links and focus, stable skill headers, roster padding, and horizontal overflow.
- Planner: 1440, 390, and 320 px. Both labeled cards open the corresponding editor and remain usable without horizontal overflow.
- Talent revision: 1440, 390, and 320 px in both themes. Checked all six Thorns promotion/potential combinations, locked talents, Penance's separate Potential 3/5 thresholds, card stability, retained selection, details, and the restored Overview introduction.
- Bounds revision: verified desktop containment down to 920 × 500, mobile horizontal containment at 390 and 320 px, section switching, and removal of the Artwork option.
- Credits revision: verified Thorns' artist/designer and combined English/Spanish credits, Botani's artist and Russian voice credit, omitted absent designer rows, mobile wrapping at 390/320 px, both themes, and section isolation.
- Final workspace: 16 browser cases across Penance, Thorns the Lodestar, Amiya, Lancet-2, Exusiai, and Botani in both themes, from 320 px mobile to 1440 px desktop (including 920 × 500). Exercised every available section, section isolation, bounds, Stats inputs, stable skill headers, archive expansion, Back/Forward navigation, and desktop scroll restoration. Separate checks covered keyboard activation, mastery-to-skill links, artwork dialog focus/Escape, and bottom control clearance. Typecheck, 15 operator tests, and production build passed.
- Short-window containment: checked Thorns in both themes at eight viewport sizes, from 280 px wide phones to 1440 px desktops, including 920 × 360 and 768 × 320. Every section remained reachable without horizontal overflow; search dropdowns fit the viewport and skill header positions stayed stable. The production build and 15 operator tests passed.
- Ad gutters: verified centered workspace widths and at least 184 px reserved on each side at 1280, 1440, and 1920 px viewport widths. Checked all sections, search bounds, and stable skill headers at six viewport sizes in both themes, including a short desktop window and mobile.

Review locally at `/operators/Penance#stats`, `/operators`, and `/planner` on port 3177. These ports identify the original previews; integration validation is recorded in `operator-dossier-preview.md`.
