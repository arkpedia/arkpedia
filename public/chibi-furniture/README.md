# Roaming chibi furniture

The app loads the original game-client catalogue renders from the commit-pinned
ArknightsAssets dump; it does not alter or redraw the furniture.

- Black Retro Chair: `furni_s2_chair_L_01`,
  `assets/dyn/arts/ui/furnitureicons/s2_01/furni_s2_chair_l_01.png`,
  blob `717edc240f7a47f2afc90381bb7981bcfe885954`.
- Porcelain Bed: `furni_s1_bed_01`,
  `assets/dyn/arts/ui/furnitureicons/s1_01/furni_s1_bed_01.png`,
  blob `f228eec6f230a18727dd4f0f279232d74c3ad5fe`.

Source revision: `ArknightsAssets/ArknightsAssets2` at
`404cf368572a4f346f66614612c40fd7779012b5`.
Furniture IDs match `building_data.customData.furnitures`.

The SVGs are display masks in the original 226×169 coordinate system. They clip
the baked grey catalogue backdrop from the original PNGs, including the spaces
between chair legs. Their contours follow pixels darker than the backdrop by
42/255 or with a channel spread above 20/255; tiny isolated specks are omitted.
