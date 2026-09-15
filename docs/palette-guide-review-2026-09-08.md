# Palette guide review — 2026-09-08

Completed a fresh visual review of **all 816 available artworks: 425 Base and 391 Elite 2** against the updated five-slot guide. This supersedes the earlier [visual pass](palette-visual-review-2026-09-08.md), which preceded the explicit skin-or-clothing rule. Purchased costumes remain excluded; the existing Global release filter still determines which reviewed artworks are playable.

- Corrected **495 palettes** (238 Base, 257 Elite 2), changing **577 swatches**.
- Retained **321 palettes** after checking all five roles against their artwork.
- Classified the fourth slot as skin in **475** artworks, clothing in **327**, and nonhuman body/equipment in **14**.
- Preserved prior records inside `previousDecision` whenever colors, labels, or stored samples changed, including any earlier history already stored there. Harold Base keeps its approved colors, labels, and all five exact samples.

## Guide applied

1. Hair, or visible headgear/fur/shell when hair is covered or absent.
2. Main clothing color.
3. Second recognizable clothing color.
4. Representative exposed skin when arms, legs, or torso form a substantial visible feature; otherwise a third clothing color.
5. Distinctive accent, weapon, accessory, trim, or effect.

Small faces, hands, and narrow skin gaps alone do not force a skin swatch. Stockings and tights count as clothing. Body and equipment replace clothing roles for nonhuman designs. Base and Elite 2 were assessed separately, including E2 backgrounds and effects that can distract from the operator. Clothing slots were checked for actual garments rather than extra hair shades, surrounding scenery, or weapon glow. Existing signature-color fixes remain visible, including Figurino's green hair, Kroos's green shirt, Tequila's blue shirt, Narantuya's cyan details, and Texas's yellow sword.

## Review evidence and persistence

Each artwork has a `guideReview` record in `data/color-palette-reviews.json`, with version `hair-clothing-skin-accent-v1`, a description of all five visible features, the fourth-slot classification and rationale, the reviewer, and review time. These are explicit visual decisions, including retained palettes; a timestamp alone is not used as evidence of completion.

All replacement colors were selected visually and sampled from explicit original-image coordinates. Scripts only assembled comparison sheets, read those chosen pixels, validated them, and saved the decisions. Replacement patches and ambiguous garments were inspected at larger sizes; coordinates that landed on adjacent straps, seams, effects, or transparent edges were corrected before applying. Every new sample matches an opaque original pixel (alpha at least 192) and the recorded source SHA-256.

Visual acceptances use `accepted`, with exact `samples` retained for corrected slots. Unchanged colors are not presented as newly sampled pixels. Full five-sample manual `approved` records remain distinct. Applied palettes in `data/color-palettes.json` retain source and review fingerprints; regeneration uses saved reviews, and changed artwork requires a fresh review. Normal website builds read committed JSON and perform no new image processing.

Validation passed: all 10 offline palette tests, all 13 minigame tests, TypeScript, and a complete audit of guide coverage, source hashes, sample pixels, and applied review fingerprints. All 815 prior accepted records are archived exactly; Harold retains its complete approval.

## Corrected palettes

| Operator | Artwork | Changed slots and source features |
| --- | --- | --- |
| Aciddrop | Base | 4. bare upper thigh `#f9d8c1` |
| Akafuyu | Base | 4. bare upper arm `#dbc7c5` |
| Alanna | Base | 4. bare midriff `#ffe5ca` |
| Almond | Base | 4. bare leg `#efe1d8` |
| Amiya (Guard) | Base | 4. silver dress trim `#ecf3fc` |
| Amiya (Medic) | Base | 4. brown stockings `#311b12` |
| Angelina | Base | 4. Bare thigh skin `#f0ccbf` |
| Ansel | Base | 4. Bare knee skin `#fefef3` |
| Aphrissa | Base | 4. Bare leg skin `#dbad9f`; 5. Teal glove and accessories `#5fdec6` |
| April | Base | 4. Bare leg skin `#e6c4cd` |
| Archetto | Base | 4. bare thigh `#f2dad5` |
| Arene | Base | 4. Bare thigh skin `#e5d3c2` |
| Aroma | Base | 4. bare calf `#ecd7cc` |
| Ascalon | Base | 3. dark green leggings `#4d544f`; 5. purple blade `#6c6591` |
| Ashlock | Base | 4. bare upper thigh `#d3b9a2` |
| Astesia | Base | 4. Bare calf skin `#ede0db` |
| Astgenne | Base | 4. Bare arm skin `#e4cbcd` |
| Astgenne the Lightchaser | Base | 4. bare leg `#f7e4dd` |
| Aurora | Base | 4. Bare midriff skin `#e4d4d5` |
| Bassline | Base | 4. bare leg `#cab7ab` |
| Beanstalk | Base | 4. bare leg `#ddc4b1` |
| Beehunter | Base | 4. Bare thigh skin `#fbe0be` |
| Beeswax | Base | 4. Brown leg skin `#cfa891` |
| Bena | Base | 4. Bare leg skin `#f9d6cd` |
| Bibeak | Base | 4. Bare leg skin `#e5d1bf` |
| Blacknight | Base | 4. Bare leg skin `#b5a394` |
| Blaze | Base | 4. Bare thigh skin `#d3c2af` |
| Blaze the Igniting Spark | Base | 4. Bare leg skin `#e3c5b9` |
| Botani | Base | 4. Bare leg skin `#f6d7cf` |
| Breeze | Base | 4. Bare leg skin `#efcfb3` |
| Brigid | Base | 4. Bare midriff skin `#fddfd2` |
| Broca | Base | 4. Bare arm skin `#e4d3cd` |
| Bryophyta | Base | 4. Bare leg skin `#a97466` |
| Bubble | Base | 4. Bare leg skin `#c18e79` |
| Cairn | Base | 4. Bare leg skin `#d7b7a7` |
| Caper | Base | 4. Bare leg skin `#ecd2c8` |
| Carnelian | Base | 4. Brown leg skin `#b68774` |
| Catapult | Base | 4. Bare midriff skin `#dfbbba` |
| Cement | Base | 2. yellow jacket panel `#f1b344`; 4. Bare leg skin `#f9e4d9` |
| Ch'en | Base | 4. Bare thigh skin `#edddbe` |
| Ch'en the Dawnstreak | Base | 4. Bare leg skin `#f7c4ae` |
| Ch'en the Holungday | Base | 4. bare leg `#e9a77d` |
| Chestnut | Base | 4. Brown leg skin `#c59e77` |
| Cliffheart | Base | 4. Bare leg skin `#fffaf5` |
| Closure | Base | 4. Bare leg skin `#d3b8a6` |
| Coldshot | Base | 4. Bare thigh skin `#fdebcf`; 5. Steel-blue rifle `#77868f` |
| Contrail | Base | 4. Bare thigh skin `#cba9a7` |
| Conviction | Base | 4. bare arm `#ffc99b` |
| Crackborne | Base | 4. bare upper arm `#e2d9da` |
| Croissant | Base | 4. Bare midriff skin `#f0c1af` |
| Cuora | Base | 4. Bare leg skin `#ffe7c6` |
| Cutter | Base | 4. Bare arm skin `#fbdbc4` |
| Dagda | Base | 4. Bare leg skin `#fdeddc` |
| Deepcolor | Base | 4. Bare leg skin `#feebe4`; 5. Lime skirt trim `#dfea00` |
| Delphine | Base | 4. Bare leg skin `#dacbc7` |
| Dobermann | Base | 4. purple trousers `#363648` |
| Dorothy | Base | 4. Bare legs `#eecfc7` |
| Dusk | Base | 4. Bare legs `#beaba2` |
| Entelechia | Base | 4. Bare thigh `#dabdb5` |
| Erato | Base | 4. Bare thighs `#fff2df` |
| Estelle | Base | 4. Bare abdomen `#d09381` |
| Eunectes | Base | 4. Bare thighs `#f8eee6` |
| Exusiai | Base | 4. Bare forearms `#e9cbbf` |
| Fang the Fire-Sharpened | Base | 4. Bare abdomen `#e5cfbe` |
| Fartooth | Base | 4. Bare thighs `#f1e2d0` |
| FEater | Base | 4. Bare legs `#e9d0cd` |
| Fiammetta | Base | 4. Bare thighs `#b79288` |
| Firewhistle | Base | 4. Bare abdomen `#cdbcb6` |
| Flamebringer | Base | 4. Bare forearm `#e2bda2` |
| Flint | Base | 4. Bare abdomen `#a48b71` |
| Gavial | Base | 4. Bare upper leg `#ead6c4` |
| Gavial the Invincible | Base | 4. Bare abdomen `#f0cebc` |
| Gitano | Base | 4. Bare upper thigh `#fce9dd` |
| Grain Buds | Base | 4. Bare legs `#e9d8d0` |
| GreyThroat | Base | 4. Bare knee `#e3c0b7` |
| Harmonie | Base | 4. Bare leg `#f4e0ce` |
| Haruka | Base | 4. Bare thigh `#fbede2` |
| Heidi | Base | 4. Bare calf `#d0a896` |
| Hibiscus | Base | 4. Bare leg `#ffdcd3` |
| Highmore | Base | 4. Bare shoulder `#e2cbbc` |
| Honeyberry | Base | 4. Bare forearm `#fae3db` |
| Horn | Base | 4. Bare shoulder `#f9eeed` |
| Hoshiguma | Base | 4. Bare arm `#ffddc4` |
| Hoshiguma the Breacher | Base | 4. Bare abdomen `#fef3ee` |
| Humus | Base | 4. Bare chest `#c5957e` |
| Ifrit | Base | 4. Bare leg `#fed4ae` |
| Indigo | Base | 4. Bare leg `#efddcf` |
| Ines | Base | 4. Bare thighs `#c8b6b5` |
| Insider | Base | 4. Bare forearm `#d9c5c3` |
| Istina | Base | 4. Bare thighs `#fffce4` |
| Jackie | Base | 4. Bare thighs `#ffe3da` |
| Jessica | Base | 4. Bare knee `#f1b8a9` |
| Jieyun | Base | 4. Bare abdomen `#fbfaef` |
| Kafka | Base | 4. Bare thigh `#ffecd4` |
| Kal'tsit | Base | 4. Bare legs `#f6eddd` |
| Kal'tsit - Esperanta | Base | 4. Bare forearm `#fbf4e6` |
| Kazemaru | Base | 4. Bare thighs `#fee9d0` |
| Kestrel | Base | 4. Bare abdomen `#9c7771` |
| Kichisei | Base | 4. Bare abdomen `#e8d0c6` |
| Kirara | Base | 4. Bare legs `#f1ddcd` |
| Kirin R Yato | Base | 4. Bare abdomen `#faf2e9` |
| Kroos | Base | 4. Bare leg `#edbdab` |
| Kroos the Keen Glint | Base | 4. Bare forearm `#e6caaf` |
| La Pluma | Base | 4. Bare thigh `#e5d6d0` |
| Laios | Base | 3. Tan trousers `#a79c8b` |
| Lappland | Base | 4. Bare legs `#dbd5d2` |
| Lappland the Decadenza | Base | 4. Bare thigh `#d2c9c8` |
| Lava | Base | 4. Bare abdomen `#ffe4da` |
| Lava the Purgatory | Base | 4. Bare legs `#dda281` |
| Leizi the Thunderbringer | Base | 3. brown skirt panels `#302522` |
| Lemuen | Base | 2. black corset `#151312`; 3. white bodice frill `#ede9e6`; 4. bare upper thigh `#ebceca` |
| Leonhardt | Base | 4. bare leg `#ecc29e` |
| Leto | Base | 4. bare midriff `#ffeed9` |
| Lin | Base | 4. brown sheer stockings `#3a2e30` |
| Ling | Base | 4. bare thigh `#ffe5d0` |
| Liskarm | Base | 4. bare upper thigh `#d29c88` |
| Logos | Base | 4. bare forearm `#c6afac` |
| Lucilla | Base | 2. black dress `#171719`; 3. white sleeve frill `#fafafa`; 4. bare leg `#f4ddde` |
| Lunacub | Base | 4. bare leg `#f8e0d8` |
| Luo Xiaohei | Base | 3. dark gray creature body `#1e1f23` |
| Lutonada | Base | 4. bare upper thigh `#dacacb` |
| Manticore | Base | 4. bare leg `#f8eada` |
| Matoimaru | Base | 4. bare forearm `#fff2d4` |
| Matsukiri | Base | 4. bare forearm `#8d736e` |
| May | Base | 4. bare thigh `#fdd7d2` |
| Melanite | Base | 4. bare leg `#dc9b8a` |
| Melantha | Base | 4. bare forearm `#fffff6` |
| Meteor | Base | 4. bare midriff `#fdf2e3` |
| Meteorite | Base | 4. bare upper thigh `#f1ddbf` |
| Midnight | Base | 2. black long coat `#111111`; 3. burgundy shirt `#582e3f`; 4. bare chest `#ddc198` |
| Minimalist | Base | 4. bare lower leg `#e3d2cc` |
| Mint | Base | 4. bare upper thigh `#e9c0b0` |
| Misumi Uika | Base | 1. pale blond hair `#f3eadb` |
| Mon3tr | Base | 4. bare thigh `#d6bc9a` |
| Morgan | Base | 4. bare thigh `#c49c7a` |
| Mostima | Base | 4. bare leg `#e9c3b0` |
| Mousse | Base | 4. bare upper thigh `#fff2db` |
| Muelsyse | Base | 1. ash blond hair `#dccdae` |
| Mulberry | Base | 4. bare leg `#f9e8e0` |
| Myrrh | Base | 2. mauve cape `#726565`; 3. pale gray pink blouse `#d7c0c3`; 4. bare leg `#fac4c2` |
| Myrtle | Base | 4. bare leg `#f4cdbf` |
| Narantuya | Base | 4. bare thigh `#e3cfcd` |
| Nasti | Base | 4. bare forearm `#ddb19b` |
| Nian | Base | 3. red cropped top `#912318`; 4. bare midriff `#ffe2d1`; 2. gray long coat `#9a8b85` |
| Nightingale | Base | 3. black dress straps `#30262c`; 4. bare knee `#ffefdc` |
| Nightmare | Base | 4. bare thigh `#fff7ea` |
| Nine-Colored Deer | Base | 3. blue robe lining `#a5b3bc`; 4. bare midriff `#f2ebec` |
| Odda | Base | 4. bare upper arm `#7f4e4a` |
| Orchid | Base | 4. bare leg `#f0dcc7` |
| Paprika | Base | 4. bare thigh `#e4d8da` |
| Papyrus | Base | 4. bare lower leg `#b88c74` |
| Passenger | Base | 4. bare forearm `#c29f99` |
| Pedro | Base | 4. bare forearm `#f0ddd6` |
| Pepe | Base | 4. bare leg `#fbd8d2` |
| Perfumer | Base | 4. bare lower leg `#f9c4af` |
| Philae | Base | 4. bare thigh `#d9b296` |
| Pinecone | Base | 4. bare upper thigh `#dab0a7` |
| Platinum | Base | 4. bare midriff `#f9ead6` |
| Podenco | Base | 4. bare upper thigh `#cf9c92` |
| Poncirus | Base | 4. bare upper thigh `#e1cabd` |
| Pozëmka | Base | 4. bare thigh `#eed8d6` |
| Provence | Base | 4. bare upper thigh `#fde4d6` |
| Ptilopsis | Base | 4. bare leg `#fffcf9` |
| Pudding | Base | 4. bare thigh `#f8dec7` |
| Purestream | Base | 4. bare thigh `#fef6df` |
| Qiubai | Base | 4. bare thigh `#e9d1c0` |
| Quartz | Base | 4. bare upper thigh `#bbb3aa` |
| Quercus | Base | 4. bare lower calf `#d6bca5` |
| Raidian | Base | 4. bare leg `#6e5f59` |
| Reed | Base | 4. bare upper thigh `#e2d8cc` |
| Ripresa | Base | 4. bare upper thigh `#cdb79a` |
| Robin | Base | 4. black waist belt `#211e16` |
| Rockrock | Base | 4. bare upper thigh `#d6ae9e` |
| Rope | Base | 4. bare upper thigh `#dfc0b6` |
| Rose Salt | Base | 4. bare lower leg `#feece0` |
| Rosmontis | Base | 4. bare leg `#faf0f1` |
| Saileach | Base | 4. bare upper thigh `#f6e6d5` |
| Sand Reckoner | Base | 4. bare upper arm `#dbb5b2` |
| Scavenger | Base | 4. bare upper thigh `#cba09a` |
| Scene | Base | 4. bare leg `#e6c5a0` |
| Schwarz | Base | 4. bare midriff `#edd3ca` |
| Senshi | Base | 4. bare upper arm `#cfa178` |
| Shalem | Base | 4. bare forearm `#e4d3d9` |
| Shamare | Base | 4. pale pink stockings `#d0bec0` |
| Shaw | Base | 4. bare thigh `#fad9b2` |
| Shining | Base | 3. gray armored bodice `#9c9799` |
| Shirayuki | Base | 4. bare calf `#f0e9e0` |
| Shu | Base | 4. bare shoulder and upper chest `#f8e3d8` |
| Sideroca | Base | 2. black jacket `#090c04`; 3. cyan blouse `#4999ae`; 4. gray tights `#9a8a8b` |
| Siege | Base | 4. bare leg `#d5ae97` |
| Silence | Base | 4. bare leg `#f0c49d` |
| Silence the Paradigmatic | Base | 4. bare thigh `#e5ceb3` |
| Skadi | Base | 4. bare upper thigh `#bfa09b` |
| Skadi the Corrupting Heart | Base | 4. bare thigh `#e0cdc3` |
| Snegurochka | Base | 1. dark blue gray head hair `#585b63` |
| Snow Hunter | Base | 4. bare leg `#fee4dd` |
| Snowsant | Base | 4. bare leg `#e1ba95` |
| Sora | Base | 4. bare thigh `#ebc4ab` |
| Stainless | Base | 4. bare upper forearm `#b79f8e` |
| Steward | Base | 4. bare forearm `#fffcf1` |
| Swire | Base | 4. brown stockings `#7c645a` |
| Swire the Elegant Wit | Base | 4. bare thigh `#f1ccb4` |
| Taraxacum | Base | 4. bare upper arm `#957365` |
| Tecno | Base | 4. bare thigh `#ccc3c2` |
| Tequila | Base | 4. bare lower leg `#e2d1c0` |
| Thorns | Base | 4. bare calf `#68483e` |
| Thorns the Lodestar | Base | 4. bare upper chest `#855a4d` |
| Timeslot | Base | 4. bare leg `#d0b4ab` |
| Tippi | Base | 4. bare thigh `#fde5df` |
| Titi | Base | 4. bare shoulder `#bb8996` |
| Togawa Sakiko | Base | 4. bare leg `#f1e0d8` |
| Tomimi | Base | 4. bare upper thigh `#f5eced` |
| Tuye | Base | 4. bare leg `#6c5c5d` |
| Typhon | Base | 4. bare upper thigh `#edddd5` |
| U-Official | Base | 4. bare knee `#eed9d2` |
| Utage | Base | 4. bare upper thigh `#fbf1f5` |
| Vendela | Base | 4. bare upper thigh `#cdad8f` |
| Vermeil | Base | 4. bare leg `#efd7cd` |
| Vetochki | Base | 4. bare upper thigh `#d8bfb1` |
| Vigna | Base | 4. bare midriff `#f7baaa` |
| Viy | Base | 4. bare forearm `#eadacd` |
| Vulcan | Base | 4. bare thigh `#f5e9db` |
| W | Base | 4. bare forearm `#bba797` |
| Waai Fu | Base | 4. orange clothing panel `#ffbb57` |
| Wakaba Mutsumi | Base | 4. bare knee `#ebdedc` |
| Wanqing | Base | 4. bare forearm `#e0c9af` |
| Warmy | Base | 4. bare leg `#e2c9c8` |
| Weedy | Base | 4. bare thigh `#ffecd4` |
| Whislash | Base | 4. bare upper thigh `#fff0df` |
| Wind Chimes | Base | 1. dark brown hair `#222725`; 4. bare abdomen `#c79183` |
| Windflit | Base | 4. bare forearm `#cac0b8` |
| Windscoot | Base | 4. bare forearm `#e5906d` |
| Wiš'adel | Base | 4. bare thigh `#ceb8b2` |
| Wulfenite | Base | 4. bare upper arm `#fef8f1` |
| Xingzhu | Base | 4. bare thigh `#f3dbd8` |
| Yahata Umiri | Base | 1. brown gray hair `#3f3337`; 4. bare thigh `#ebe1db` |
| Yūtenji Nyamu | Base | 4. bare thigh `#faf1ed` |
| Zinogre S Catapult | Base | 4. bare midriff `#e2bfb6` |
| Aciddrop | Elite 2 | 4. bare upper thigh `#f4d6bc` |
| Akafuyu | Elite 2 | 4. bare midriff `#cd9785` |
| Akkord | Elite 2 | 4. bare upper arm `#d5bfb9` |
| Alanna | Elite 2 | 3. charcoal trousers `#3d3744`; 4. bare abdomen `#cda9a3` |
| Almond | Elite 2 | 4. bare thigh `#e8c8be` |
| Ambriel | Elite 2 | 4. bare upper thigh `#bd836d` |
| Andreana | Elite 2 | 4. bare waist `#efd3b8` |
| Angelina | Elite 2 | 4. bare thigh `#f4ccc5` |
| Aphrissa | Elite 2 | 4. bare upper thigh `#e5d6c6` |
| April | Elite 2 | 4. bare shin `#faeae9` |
| Archetto | Elite 2 | 4. bare thigh `#e6a58b` |
| Arene | Elite 2 | 4. bare thigh `#d4c2b4` |
| Ascalon | Elite 2 | 3. burgundy blouse `#4d2a3f`; 4. navy trousers `#0f171b` |
| Ashlock | Elite 2 | 4. bare thigh `#f6ebda` |
| Astesia | Elite 2 | 4. bare shin `#ffe9e3` |
| Astgenne | Elite 2 | 4. bare upper arm `#feeacc` |
| Astgenne the Lightchaser | Elite 2 | 4. bare thigh `#d5ac9d` |
| Aurora | Elite 2 | 4. bare abdomen `#d0b3af` |
| Ayerscarpe | Elite 2 | 4. bare forearm `#d6b7a2` |
| Bagpipe | Elite 2 | 4. bare upper thigh `#fde5d2` |
| Bassline | Elite 2 | 4. bare shin `#9f8b7b` |
| Beanstalk | Elite 2 | 4. bare shin `#af9275` |
| Beehunter | Elite 2 | 4. bare thigh `#edc39f` |
| Beeswax | Elite 2 | 4. bare upper thigh `#bc9671` |
| Bena | Elite 2 | 4. bare leg `#dbcab7` |
| Bibeak | Elite 2 | 4. bare thigh `#fff9e7` |
| Bison | Elite 2 | 4. bare forearm `#d4bc97` |
| Blacknight | Elite 2 | 4. bare thigh `#c89987` |
| Blaze | Elite 2 | 4. bare forearm `#f3e1ce` |
| Blaze the Igniting Spark | Elite 2 | 4. bare thigh `#ffd2c4` |
| Blue Poison | Elite 2 | 4. bare thigh `#f4cfc2` |
| Breeze | Elite 2 | 4. bare thigh `#fff1cd` |
| Brigid | Elite 2 | 4. bare thigh `#fcefe8` |
| Broca | Elite 2 | 4. bare upper arm `#cab0a9` |
| Bryophyta | Elite 2 | 4. bare chest `#b67560` |
| Bubble | Elite 2 | 4. bare thigh `#e2b6ae` |
| Cairn | Elite 2 | 2. beige cropped shirt `#eee3c7`; 4. bare thigh `#dba98a` |
| Cantabile | Elite 2 | 4. bare thigh `#efd7c6` |
| Caper | Elite 2 | 4. bare thigh `#f8d1c3` |
| Carnelian | Elite 2 | 4. bare upper thigh `#a16760` |
| Catherine | Elite 2 | 4. brown trousers `#7c4829` |
| Cement | Elite 2 | 4. bare shin `#c7a69d` |
| Ceobe | Elite 2 | 4. bare upper thigh `#f4cb92` |
| Ch'en | Elite 2 | 4. bare thigh `#c47363` |
| Ch'en the Dawnstreak | Elite 2 | 1. blue violet hair `#7466a1`; 4. bare upper arm `#dab9b4` |
| Ch'en the Holungday | Elite 2 | 2. dark blue bikini top `#36556a`; 3. silver gray bikini bottom `#c7dad8`; 4. bare abdomen `#f7d5b8` |
| Cliffheart | Elite 2 | 4. bare abdomen `#fcd7c1` |
| Closure | Elite 2 | 4. bare thigh `#e6c2b0` |
| Coldshot | Elite 2 | 1. purple hair `#724861`; 4. bare thigh `#eddac5` |
| Contrail | Elite 2 | 4. bare thigh `#f3e4dc` |
| Conviction | Elite 2 | 4. bare shin `#ed9a6b` |
| Courier | Elite 2 | 2. brown black trousers `#110f0d`; 4. bare upper arm `#e0ad8a` |
| Crackborne | Elite 2 | 4. bare abdomen `#d7c8cf` |
| Croissant | Elite 2 | 4. bare thigh `#ffcab3` |
| Cuora | Elite 2 | 4. bare thigh `#fdf8df` |
| Cutter | Elite 2 | 2. red sleeveless shirt `#b62636`; 4. bare upper thigh `#b69e96` |
| Dagda | Elite 2 | 4. bare thigh `#f0d8d0` |
| Deepcolor | Elite 2 | 4. bare thigh `#ffeeef` |
| Delphine | Elite 2 | 4. bare thigh `#d7c1ca` |
| Dorothy | Elite 2 | 4. bare upper thigh `#f6e5dd` |
| Dusk | Elite 2 | 4. bare thigh `#ebd6c0` |
| Earthspirit | Elite 2 | 4. bare thigh `#f9e8e0` |
| Ela | Elite 2 | 4. bare forearm `#f1e6d6` |
| Entelechia | Elite 2 | 4. bare thigh `#f2e2d3` |
| Estelle | Elite 2 | 4. bare thigh `#dd8064` |
| Ethan | Elite 2 | 1. dark teal hair in shadow `#18221e` |
| Eunectes | Elite 2 | 2. brown wrapped top `#4d321e`; 3. blue skirt panel `#1a334f`; 4. bare thigh `#d18976` |
| Exusiai | Elite 2 | 4. bare forearm `#d2ada1` |
| Exusiai the New Covenant | Elite 2 | 4. bare thigh `#efd8c9` |
| Eyjafjalla | Elite 2 | 4. bare upper thigh `#eed5c5` |
| Eyjafjalla the Hvít Aska | Elite 2 | 4. bare upper thigh `#cea49c` |
| Fang the Fire-Sharpened | Elite 2 | 4. bare abdomen `#e8c6b6` |
| Fartooth | Elite 2 | 4. bare thigh `#d4ba97` |
| FEater | Elite 2 | 4. bare thigh `#e4bbbb` |
| Fiammetta | Elite 2 | 4. bare thigh `#c89178` |
| Figurino | Elite 2 | 4. bare abdomen `#ce926b` |
| Firewhistle | Elite 2 | 1. brown hair `#9b664d`; 4. bare upper arm `#d8a592` |
| Flamebringer | Elite 2 | 4. bare forearm `#fde2b9` |
| Flametail | Elite 2 | 4. bare thigh `#f3dcbf` |
| Flint | Elite 2 | 4. bare abdomen `#bfa58c` |
| Folinic | Elite 2 | 4. bare thigh `#f1e6e5` |
| Frostleaf | Elite 2 | 2. black coat `#3e2e3e` |
| Gavial | Elite 2 | 4. bare shin `#e6c8ae` |
| Gavial the Invincible | Elite 2 | 4. bare thigh `#c6ab8e` |
| Gitano | Elite 2 | 4. bare thigh `#f8e7d6` |
| Glaucus | Elite 2 | 4. bare upper thigh `#a99091` |
| Goldenglow | Elite 2 | 4. bare upper thigh `#f7eae5` |
| Grain Buds | Elite 2 | 1. pale gray hair `#faf2e9`; 4. bare shin `#b08d77` |
| Grani | Elite 2 | 4. bare upper thigh `#fee6d5` |
| Gravel | Elite 2 | 4. bare thigh `#b28169` |
| GreyThroat | Elite 2 | 4. bare upper arm `#ebe3da` |
| Greyy the Lightningbearer | Elite 2 | 4. bare forearm `#bb8b72` |
| Hadiya | Elite 2 | 4. bare thigh `#c89c8f` |
| Haruka | Elite 2 | 4. bare thigh `#fff7f3` |
| Haze | Elite 2 | 4. bare upper thigh `#ffffeb` |
| Heidi | Elite 2 | 4. bare shin `#fee3d1` |
| Hibiscus the Purifier | Elite 2 | 4. bare forearm `#f2d1ca` |
| Ho'olheyak | Elite 2 | 1. silver blue hair `#8894a0` |
| Honeyberry | Elite 2 | 4. bare upper thigh `#f8e2d2` |
| Horn | Elite 2 | 4. bare abdomen `#dabea5` |
| Hoshiguma | Elite 2 | 4. bare forearm `#8f684f` |
| Hoshiguma the Breacher | Elite 2 | 4. bare abdomen `#efe8e6` |
| Humus | Elite 2 | 4. bare chest `#fad9a7` |
| Ifrit | Elite 2 | 4. bare shin `#fcd4b2` |
| Indigo | Elite 2 | 4. bare upper thigh `#b39a87` |
| Indra | Elite 2 | 4. bare abdomen `#c2a390` |
| Ines | Elite 2 | 4. bare thigh `#c1afae` |
| Insider | Elite 2 | 4. bare forearm `#c79d97` |
| Iris | Elite 2 | 4. bare thigh `#a39ba4` |
| Istina | Elite 2 | 4. bare thigh `#fff7e6` |
| Jacinta | Elite 2 | 4. bare shin `#f3deca` |
| Jackie | Elite 2 | 4. bare thigh `#ffe9df` |
| Jaye | Elite 2 | 4. bare forearm `#c9b7a8` |
| Jessica | Elite 2 | 4. bare thigh `#f2d3d2` |
| Jessica the Liberated | Elite 2 | 4. bare thigh `#f0ebea` |
| Jieyun | Elite 2 | 4. bare upper arm `#dbcdb4` |
| Kafka | Elite 2 | 4. bare shin `#e8c7ae` |
| Kal'tsit | Elite 2 | 4. bare leg `#d38f59` |
| Kal'tsit - Esperanta | Elite 2 | 2. white breastplate `#e7e4de`; 4. bare upper arm `#e9d0c2` |
| Kazemaru | Elite 2 | 4. bare thigh `#d5af9c` |
| Kestrel | Elite 2 | 4. bare abdomen `#b27571` |
| Kichisei | Elite 2 | 4. bare abdomen `#ebdbd0` |
| Kirara | Elite 2 | 4. bare shin `#c9afce` |
| Kirin R Yato | Elite 2 | 1. maroon brown hair `#75474b`; 4. bare abdomen `#cba09a` |
| Kjera | Elite 2 | 4. bare upper arm `#c6aa94` |
| Kroos the Keen Glint | Elite 2 | 4. bare forearm `#d7b79b` |
| La Pluma | Elite 2 | 4. bare thigh `#fcf4ec` |
| Lappland | Elite 2 | 4. bare shin `#ada39d` |
| Lava the Purgatory | Elite 2 | 4. bare thigh `#d5c1af` |
| Leizi | Elite 2 | 4. bare upper arm `#f5dbc9` |
| Leizi the Thunderbringer | Elite 2 | 4. bare upper arm `#ffdcd1` |
| Lemuen | Elite 2 | 4. bare upper thigh `#a68b89` |
| Leonhardt | Elite 2 | 3. pale jacket `#b3a29e`; 4. bare thigh `#efbb9b` |
| Leto | Elite 2 | 4. bare thigh `#fcefdf` |
| Lin | Elite 2 | 4. bare thigh `#d8bdbd` |
| Ling | Elite 2 | 4. bare thigh `#f3cabf` |
| Liskarm | Elite 2 | 4. bare upper thigh `#fcf6ed` |
| Lucilla | Elite 2 | 4. bare thigh `#e1cbd3` |
| Lunacub | Elite 2 | 2. burgundy coat `#482424`; 3. white inner garment `#d8dade`; 4. bare leg `#e1c2be` |
| Manticore | Elite 2 | 3. bronze shoulder armor `#b4a98d`; 4. bare upper arm `#c3778e` |
| Matoimaru | Elite 2 | 4. bare upper arm `#fbe5ba` |
| May | Elite 2 | 4. bare thigh `#f4d1d8` |
| Melanite | Elite 2 | 3. purple coat lining `#7e6da0`; 4. bare leg `#b97469` |
| Meteor | Elite 2 | 4. bare abdomen `#f8e7d6` |
| Meteorite | Elite 2 | 1. strawberry blonde hair `#9a5d4b`; 4. bare thigh `#e6a997` |
| Minimalist | Elite 2 | 2. navy vest `#414873`; 3. white shirt `#d1c9c5`; 4. bare leg `#bda4a1` |
| Mint | Elite 2 | 2. grey dress `#808988`; 4. bare thigh `#c0b0a1` |
| Miss.Christine | Elite 2 | 2. red bow `#f05a48`; 3. cream chest fur `#cec0a7`; 4. gold frame `#f9e79e`; 5. blue bow jewel `#055ac4` |
| Misumi Uika | Elite 2 | 4. bare thigh `#fdd6ba` |
| Mon3tr | Elite 2 | 1. white hair `#dbdabf`; 2. green dress `#4c683b`; 4. bare thigh `#e9c29d` |
| Morgan | Elite 2 | 4. bare thigh `#bd9b7c` |
| Mostima | Elite 2 | 3. white shirt `#fffff9`; 4. bare leg `#deaa9a` |
| Mudrock | Elite 2 | 4. bare shoulder `#f0c6bb` |
| Muelsyse | Elite 2 | 2. pale green grey coat `#767f7f` |
| Mulberry | Elite 2 | 2. white top `#f1f1f1`; 3. black waist pouch `#353130`; 4. bare thigh `#fbebe3` |
| Myrrh | Elite 2 | 4. bare thigh `#f8e2dc` |
| Myrtle | Elite 2 | 2. white blouse `#f9efde`; 4. bare leg `#f4d3c3` |
| Narantuya | Elite 2 | 2. dark shorts `#332320`; 3. white waist cloth `#c9b5b2`; 4. bare thigh `#ede9e8` |
| Nearl the Radiant Knight | Elite 2 | 3. black armor straps `#0d0a19`; 4. bare thigh `#e4b6a1` |
| Nian | Elite 2 | 4. bare thigh `#ddaf9a` |
| Nightingale | Elite 2 | 2. white dress `#fcf9df`; 3. black dress strap `#453138`; 4. bare thigh `#efc19e` |
| Nightmare | Elite 2 | 4. bare thigh `#fefef1` |
| Nine-Colored Deer | Elite 2 | 3. teal waist sash `#4e8e9b`; 4. bare abdomen `#c6aca5` |
| Nowell | Elite 2 | 2. white shirt `#c2c6c9`; 4. bare forearm `#e7c8b7` |
| Odda | Elite 2 | 4. bare forearm `#c88b6d` |
| Paprika | Elite 2 | 4. bare thigh `#d6c6c5` |
| Papyrus | Elite 2 | 4. bare leg `#f5cdb8` |
| Pepe | Elite 2 | 4. bare thigh `#fabfbe` |
| Perfumer | Elite 2 | 4. bare shin `#ffc8ad` |
| Perfumer the Distilled | Elite 2 | 3. black bodice and harness `#47372a`; 4. bare calf `#756256` |
| Philae | Elite 2 | 4. bare abdomen `#f0d2aa` |
| Pinecone | Elite 2 | 4. bare upper thigh `#edb48c` |
| Platinum | Elite 2 | 4. bare upper thigh `#999596` |
| Podenco | Elite 2 | 4. bare upper thigh `#fdfeeb` |
| Poncirus | Elite 2 | 4. bare upper arm `#efe5d8` |
| Pozëmka | Elite 2 | 4. bare thigh `#ebc7c7`; 3. black dress `#1d1211` |
| Pramanix | Elite 2 | 4. bare thigh `#fbf2e3` |
| Pramanix the Prerita | Elite 2 | 2. navy dress `#211e2f`; 3. brown leather belt `#9d7d6d` |
| Provence | Elite 2 | 4. bare thigh `#fff7e3` |
| Ptilopsis | Elite 2 | 4. bare thigh `#ede1d3` |
| Pudding | Elite 2 | 4. bare thigh `#ffe5de` |
| Purestream | Elite 2 | 4. bare thigh `#fbf4db` |
| Puzzle | Elite 2 | 4. bare forearm `#dfabaa` |
| Qiubai | Elite 2 | 4. bare thigh `#ecd5c9` |
| Quercus | Elite 2 | 4. bare upper arm `#c4a279` |
| Raidian | Elite 2 | 4. bare thigh `#b0998a` |
| Ray | Elite 2 | 4. bare abdomen `#c5aca2` |
| Reed | Elite 2 | 4. bare upper thigh `#cda496` |
| Ripresa | Elite 2 | 4. bare upper thigh `#d1bdad` |
| Rockrock | Elite 2 | 4. bare thigh `#deb6a6` |
| Rope | Elite 2 | 4. bare upper thigh `#967b76` |
| Rose Salt | Elite 2 | 4. bare shin `#e6b7a0` |
| Rosmontis | Elite 2 | 3. white dress `#ebd5d1`; 4. bare forearm `#eac3a9` |
| Sand Reckoner | Elite 2 | 4. bare chest `#b8827b` |
| Santalla | Elite 2 | 4. bare upper thigh `#ebd4cc` |
| Savage | Elite 2 | 4. bare upper arm `#a08c7c` |
| Scavenger | Elite 2 | 4. bare thigh `#e7d6ce` |
| Scene | Elite 2 | 4. bare thigh `#fdeecc` |
| Schwarz | Elite 2 | 4. bare thigh `#ceac9c` |
| Shining | Elite 2 | 4. bare thigh `#efceac` |
| Shirayuki | Elite 2 | 4. bare upper arm `#fff7e1` |
| Shu | Elite 2 | 4. bare shoulder `#ffe9d5` |
| Sideroca | Elite 2 | 4. bare thigh `#fdeddc` |
| Siege | Elite 2 | 4. bare thigh `#d8baa0` |
| Silence | Elite 2 | 4. bare thigh `#f2c8a6` |
| Silence the Paradigmatic | Elite 2 | 4. bare thigh `#f8e0bf` |
| SilverAsh the Reignfrost | Elite 2 | 2. white coat `#e3e7ef` |
| Skadi | Elite 2 | 4. bare thigh `#fbeaf2` |
| Skadi the Corrupting Heart | Elite 2 | 4. bare thigh `#c7acbc` |
| Skybox | Elite 2 | 1. silver helmet `#728394`; 2. silver flight suit `#a2b8c0`; 3. grey harness `#3f4a4b` |
| Skyfire | Elite 2 | 4. bare forearm `#f2d0c0` |
| Snow Hunter | Elite 2 | 4. bare thigh `#feeae6` |
| Snowsant | Elite 2 | 4. bare thigh `#e2b892` |
| Sora | Elite 2 | 4. bare thigh `#edcdb6` |
| Specter the Unchained | Elite 2 | 4. bare upper arm `#dfc4b8` |
| Stainless | Elite 2 | 2. black vest `#121c16`; 3. burgundy trousers `#451c1d`; 4. bare upper arm `#f1ddcd` |
| Suzuran | Elite 2 | 2. violet skirt `#7c8cf2`; 3. white apron `#cadbfc`; 4. bare forearm `#f2d3d0`; 5. cyan apron trim `#66beeb` |
| Swire the Elegant Wit | Elite 2 | 4. bare thigh `#e9bfb4` |
| Taraxacum | Elite 2 | 2. navy vest `#3c4456`; 4. bare knee `#c9a28d` |
| Tecno | Elite 2 | 4. bare thigh `#c9b8bc` |
| Tequila | Elite 2 | 4. bare shin `#d1b8a8` |
| Thumpy | Elite 2 | 4. bare upper arm `#f9e7e4` |
| Timeslot | Elite 2 | 4. bare leg `#edcec4` |
| Tippi | Elite 2 | 4. bare thigh `#f8c8c6` |
| Titi | Elite 2 | 4. bare thigh `#f0acac` |
| Toddifons | Elite 2 | 4. bare upper arm `#d6bdac` |
| Togawa Sakiko | Elite 2 | 3. mauve grey skirt `#9f8987`; 4. bare forearm `#ecc9ce` |
| Tomimi | Elite 2 | 4. bare thigh `#fcfbfc` |
| Totter | Elite 2 | 4. bare upper arm `#eac8ba` |
| Tragodia | Elite 2 | 1. grey hair `#988e86`; 2. black coat `#393741`; 3. blue scarf `#3a3ab7`; 4. gold coat piping `#c09d75` |
| Tsukinogi | Elite 2 | 4. bare thigh `#bba2b1` |
| Tuye | Elite 2 | 4. bare shin `#846a63` |
| Typhon | Elite 2 | 4. bare thigh `#f0d6cf` |
| Ukusik | Elite 2 | 4. bare leg `#a8a3b5` |
| Utage | Elite 2 | 4. bare upper thigh `#ffedec` |
| Valarqvin | Elite 2 | 4. bare upper thigh `#b6aaa0` |
| Vendela | Elite 2 | 4. bare upper arm `#febca1` |
| Vermeil | Elite 2 | 4. bare thigh `#eddbcc` |
| Vetochki | Elite 2 | 4. bare thigh `#fff2e6` |
| Vigna | Elite 2 | 4. bare upper thigh `#f38981` |
| Violet Mizutsune Orchid | Elite 2 | 4. bare upper thigh `#e8cbc7` |
| Vulcan | Elite 2 | 4. bare thigh `#f5e7dc` |
| Wakaba Mutsumi | Elite 2 | 4. white collar `#f8faec` |
| Wanqing | Elite 2 | 4. bare forearm `#caa280` |
| Warmy | Elite 2 | 3. orange skirt `#e8c151`; 4. black boot `#343d33` |
| Weedy | Elite 2 | 4. bare shoulder `#fef9f6` |
| Whislash | Elite 2 | 4. bare thigh `#debaa8` |
| Whisperain | Elite 2 | 4. bare shoulder `#fbf1f5` |
| Wild Mane | Elite 2 | 4. bare thigh `#e8cdad` |
| Wind Chimes | Elite 2 | 4. bare abdomen `#d8a9a5` |
| Windflit | Elite 2 | 2. black shirt `#1e1f28`; 3. charcoal trousers `#101010`; 4. bare upper arm `#cdaeab` |
| Wiš'adel | Elite 2 | 2. black bodysuit `#1e1c1a`; 4. bare thigh `#ac958d`; 3. white shorts trim `#cfcec5` |
| Wulfenite | Elite 2 | 4. bare upper arm `#f8eada` |
| Xingzhu | Elite 2 | 4. bare thigh `#edd2ce` |
| Yūtenji Nyamu | Elite 2 | 4. bare thigh `#ab665b` |
| Zinogre S Catapult | Elite 2 | 4. bare abdomen `#cb9a91` |
| Zuo Le | Elite 2 | 4. bare upper arm `#f8e7d2` |
