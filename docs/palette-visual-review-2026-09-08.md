# Visual palette review — 2026-09-08

Completed a visual pass over all **816** available illustrations: **425 Base** and **391 Elite 2**. Purchasable costumes are excluded; the existing release and artwork eligibility filters still control the playable pool.

- Corrected **184 palettes** (98 Base, 86 Elite 2), changing **216 swatches**.
- Retained 606 palettes after visual comparison.
- Preserved all 26 existing user acceptances/approvals exactly, including Harold Base.
- Corrected all eight previously declined palettes; their original decisions are retained in each record’s `previousDecision`.

The review checked hair (or a visible head/fur/shell equivalent), two or three clothing colors, and a characteristic weapon, accessory, trim, or effect. Base and Elite 2 were inspected separately. Small accents were checked in enlarged artwork crops, and uncertain samples were checked against nearby source pixels to avoid choosing a highlight, shadow, or adjacent detail.

Colors were chosen by visual inspection. Scripts laid out comparison sheets, read the explicitly selected coordinates, validated their pixels, and saved the decisions; they did not decide which palettes to accept or choose their replacement colors.

These records use `accepted`, with `reviewedBy: "Codex"` and `reviewMethod: "visual"`. Replaced swatches also store exact original-image coordinates and feature labels in `samples`; retained swatches have no newly claimed pixel provenance. This is visual acceptance, not a claim that all five slots were manually resampled. The existing `approved` status remains reserved for complete five-feature source sampling.

All accepted colors are applied to `data/color-palettes.json` and protected by source and review fingerprints. Changed artwork requires another review. Provisional recipes remain available for new artwork; normal website builds only read committed JSON.

## Corrected palettes

| Operator | Artwork | Resampled features |
| --- | --- | --- |
| Aciddrop | Base | Tan hair `#aa7850`; Rust jacket `#a3401f`; Black shorts `#42434c`; Grey leg armour `#aca29a`; Pale headphones `#c9baa8` |
| Almond | Base | Ash-brown hair `#806e62`; Yellow safety markings `#b2a032` |
| Amiya (Guard) | Base | Brown hair `#26131a`; Red blade `#fe0d35` |
| Amiya (Medic) | Base | Dark brown hair `#7a5441`; Teal collar `#41cae3` |
| Angelina the Mellow Wish | Base | Peach-brown hair `#b47e69`; Red weapon trim `#a42013` |
| April | Base | Ash-brown hair `#998b8b` |
| Aroma | Base | Mauve-brown hair `#826f65`; Blue glove `#558ec8` |
| Ascalon | Base | Burgundy hair `#8c4168` |
| Ashlock | Base | Pale blonde hair `#eed1bd` |
| Astgenne the Lightchaser | Base | Blue hair `#3e5a81`; Khaki coat `#b3a28c` |
| Aurora | Base | Teal strap `#77e5eb` |
| Beagle | Base | Copper hair `#df6042` |
| Beehunter | Base | Olive-brown hair `#6f6743`; White forelock `#ffffff` |
| Bellone | Base | Red hair `#a03247` |
| Bison | Base | Red straps `#a42647` |
| Blemishine | Base | Pale shoulder fur `#f5ede9`; Gold cape fittings `#a49d8b` |
| Blitz | Base | Black helmet (hair covered) `#282828` |
| Breeze | Base | Beige-blonde hair `#dfcaa3` |
| Brigid | Base | Golden blonde hair `#c59a64`; Dusty pink drapery `#b99495`; Orange hair ends `#ee8527` |
| Bryophyta | Base | Black hair (red is the headband) `#1e1e1e`; Rust jacket `#692b20` |
| Cantabile | Base | Red waist ribbons `#b02b3d` |
| Catapult | Base | Chestnut hair `#b5847d` |
| Catherine | Base | Red top `#98130c` |
| Cement | Base | Brown hair `#99807d` |
| Click | Base | Chartreuse shirt `#c6c52f` |
| Cliffheart | Base | Golden climbing rope `#e8d19b` |
| Contrail | Base | Ash-brown hair `#978078`; Pale coat `#e9e5e1` |
| Courier | Base | Near-black hair `#2f2b28` |
| Deepcolor | Base | Fluorescent yellow-green trim `#e3ec00` |
| Dobermann | Base | Navy-violet trousers `#343348` |
| Dusk | Base | Teal robe pattern `#0c5e62` |
| Erato | Base | Coral hair `#f0a99c` |
| Estelle | Base | Yellow-green hair `#bcb45a` |
| Exusiai | Base | Magenta wristband `#b80846` |
| FEater | Base | Pink equipment strap `#943479` |
| Firewhistle | Base | Taupe hair `#a89484`; Deep teal coat `#254757` |
| Flint | Base | Teal cape embroidery `#224240` |
| Franka | Base | Copper hair `#966254` |
| Frostleaf | Base | Pale pink hair `#e9cece` |
| Gavial the Invincible | Base | Green hair `#25371a` |
| Gitano | Base | Pale pink hair `#ebdfd6` |
| Goldenglow | Base | Yellow strap `#fed32e` |
| Gracebearer | Base | Burgundy-red hair `#7e3844` |
| Grain Buds | Base | Cream-white hair `#f6f4f0`; Forest-green lining `#63755a` |
| Gravel | Base | Teal hood lining `#a7bebb` |
| Haruka | Base | Pale peach-pink hair `#ecd0c7`; Navy-blue outfit `#29325d` |
| Heidi | Base | Copper hair `#b26c5d` |
| Hibiscus the Purifier | Base | Magenta flower `#ca3192` |
| Ho'olheyak | Base | Silver-grey hair `#adb4b6`; Cyan loop fastening `#12f4f0` |
| Horn | Base | Olive uniform `#434237` |
| Hoshiguma | Base | Black trousers `#18181a`; Gunmetal shield `#2c2c2c` |
| Humus | Base | Russet hair `#ad4946` |
| Indra | Base | Deep teal jacket `#192d34` |
| Iris | Base | Golden-brown hair `#a78155` |
| Jacinta | Base | Peach-pink hair ends `#c38172` |
| Jieyun | Base | Mauve-brown hair `#906e6a` |
| Kestrel | Base | Yellow chest panel `#d6c287` |
| Lemuen | Base | Pink boot lacing `#8b7173` |
| Leonhardt | Base | Lime collar `#f1f05a` |
| Liskarm | Base | Silver-blue hair `#8d8994` |
| Manticore | Base | Pink hood lining `#feb1cb`; Violet tail `#7d7cba` |
| Matsukiri | Base | Green scarf `#455827` |
| Matterhorn | Base | Dark brown hair `#38302e` |
| Midnight | Base | Rose shirt collar `#e66b85` |
| Misumi Uika | Base | Pale cream hair `#fbf2f0` |
| Mizuki | Base | Royal blue jacket `#124594`; Yellow-green hood lining `#d7dc66` |
| Mon3tr | Base | Bright green front panel `#759750` |
| Mostima | Base | Royal blue hair `#253b78` |
| Mr. Nothing | Base | Brass fastenings `#b8936d` |
| Mulberry | Base | Blue hood lining `#5f5bd5` |
| Papyrus | Base | Pale gold staff `#b2a587` |
| Passenger | Base | Copper-pink hair `#c28477` |
| Poncirus | Base | Pistachio-green hair `#c5c4a2` |
| Popukar | Base | Grey-mauve hair `#a68e94` |
| Proviso | Base | Pale ash-green hair `#acac93` |
| Purestream | Base | Plum hair `#5c3b51` |
| Scene | Base | Chartreuse coat edges `#e3fa08` |
| Shu | Base | Royal blue hair ends `#12166b`; Golden hair strands `#928046` |
| Skybox | Base | Ice-blue helmet `#97acb5` |
| Sora | Base | Pink cape lining `#f16172` |
| Spot | Base | Electric violet shirt print `#5a3fb1` |
| Surfer | Base | Royal blue jacket `#314aba`; Yellow zip panel `#c8b258` |
| Sussurro | Base | Pale pink hair `#fbeee7` |
| Suzuran | Base | Pale blonde hair `#efe0bc` |
| Texas the Omertosa | Base | Royal blue ribbons `#1f34ae` |
| Togawa Sakiko | Base | Light blue hair `#5e7399` |
| Tomimi | Base | Silver scaled tail `#b6b8be` |
| Tsukinogi | Base | Gold shawl `#ab8e7d` |
| U-Official | Base | Yellow chair cushion `#d9cd9a` |
| Utage | Base | Yellow jacket trim `#d4c244` |
| Vermeil | Base | Orange-red cape edge `#e2624d` |
| Vigil | Base | Violet coat lining `#392196` |
| Vina Victoria | Base | Royal blue cloak `#133169` |
| Warmy | Base | Pale ash-pink hair `#c6afae` |
| Whislash | Base | Brown leather boots `#322b2d` |
| Windscoot | Base | Lime shoelaces `#a4bb5a` |
| Wulfenite | Base | Coral-orange hair `#e99883` |
| Yato | Base | Charcoal-taupe sleeve `#b2adad` |
| Aciddrop | Elite 2 | Tan hair `#c28857`; Burnt orange jacket `#904d34` |
| Almond | Elite 2 | Ash-brown hair `#b5a79a` |
| Angelina the Mellow Wish | Elite 2 | Copper hair `#813a30`; Red waist cloth `#b4060a` |
| April | Elite 2 | Ash-brown hair `#62504f` |
| Aroma | Elite 2 | Mauve-brown hair `#796567`; Blue trousers `#22294d` |
| Ascalon | Elite 2 | Burgundy hair `#b25f81` |
| Ashlock | Elite 2 | Pale blonde hair `#dacfbe` |
| Astgenne the Lightchaser | Elite 2 | Blue hair `#325665`; Pale khaki coat `#d5cbc1` |
| Beehunter | Elite 2 | Olive-brown hair `#76693d`; White forelock `#e7e7d9` |
| Bellone | Elite 2 | Red hair `#983c52` |
| Bibeak | Elite 2 | Yellow necktie `#e7e954` |
| Bison | Elite 2 | Red straps `#98182a` |
| Blemishine | Elite 2 | Pale skirt and cape `#e4cabe` |
| Blitz | Elite 2 | Black helmet (hair covered) `#171719` |
| Breeze | Elite 2 | Beige-blonde hair `#ecc59b` |
| Brigid | Elite 2 | Golden-orange hair `#f89c27`; Dusty pink drapery `#815751` |
| Bryophyta | Elite 2 | Black hair (red is the headband) `#0b1713`; Red-orange jacket `#fa5639` |
| Cantabile | Elite 2 | Red waist fabric `#a60b09` |
| Catherine | Elite 2 | Red top `#b63218` |
| Cement | Elite 2 | Brown hair `#7c5c5b` |
| Ceylon | Elite 2 | Pale pink hair `#c7a8a7` |
| Click | Elite 2 | Chartreuse camera `#eaea28` |
| Contrail | Elite 2 | Ash-brown hair `#c8ad90` |
| Courier | Elite 2 | Near-black hair `#322c29` |
| Dusk | Elite 2 | Teal robe `#0c4148` |
| Erato | Elite 2 | Coral hair `#e78982` |
| Estelle | Elite 2 | Yellow-green hair `#c8ba3d` |
| Exusiai | Elite 2 | Magenta wristband `#b62759` |
| Eyjafjalla the Hvít Aska | Elite 2 | Burgundy coat `#68222c` |
| FEater | Elite 2 | Red coat tassel `#8f0e0c` |
| Firewatch | Elite 2 | Beige hair `#b2aa96` |
| Flint | Elite 2 | Dark purple hair `#3e3c48` |
| Franka | Elite 2 | Copper hair `#bc7e68` |
| Gavial | Elite 2 | Lime-green star `#9ee90c` |
| Gitano | Elite 2 | Pink deer effects `#fd9ea9` |
| Gnosis | Elite 2 | Near-black hair `#120f10` |
| Gracebearer | Elite 2 | Burgundy-red hair `#bf4f60` |
| Gravel | Elite 2 | Peach-coral hair `#edb09e` |
| Greyy | Elite 2 | Sandy-brown hair `#dbab82` |
| Gummy | Elite 2 | Red-orange tights `#d13b19` |
| Harold | Elite 2 | Yellow-green effects `#eeff91` |
| Haruka | Elite 2 | Coral-orange hair `#c58375` |
| Hibiscus the Purifier | Elite 2 | Magenta flower `#ea6ab5` |
| Hoederer | Elite 2 | Brown hair `#342b2b` |
| Ifrit | Elite 2 | Pale blonde hair `#fdf6da` |
| Jieyun | Elite 2 | Green trousers `#667061` |
| Kal'tsit | Elite 2 | Bright green crystals `#b3f526` |
| Kazemaru | Elite 2 | Pink paper figure `#e4879f` |
| Leizi the Thunderbringer | Elite 2 | Navy-purple trousers `#050d16` |
| Leto | Elite 2 | Red scarf `#970c0d` |
| Lin | Elite 2 | Rose-brown hair `#9c828b` |
| Mayer | Elite 2 | Sandy-blonde hair `#c2a289` |
| Mechanist | Elite 2 | Electric blue effects `#1003a9` |
| Mitm | Elite 2 | Silver hair `#ccd1cd` |
| Mon3tr | Elite 2 | Vivid green effects `#a6e901` |
| Muelsyse | Elite 2 | Pale ash-blonde hair `#9c9074` |
| Nowell | Elite 2 | Brown hair `#42484d` |
| Passenger | Elite 2 | Copper-orange hair `#86432f` |
| Pedro | Elite 2 | Brown hair `#413d3a` |
| Pinecone | Elite 2 | Warm brown jacket `#b66b40` |
| Podenco | Elite 2 | Emerald-green coat `#09424c` |
| Proviso | Elite 2 | Pale mint hair `#c9d1ae` |
| Purestream | Elite 2 | Plum-purple hair `#4a2447` |
| Raidian | Elite 2 | Sandy-blonde hair `#9b9695` |
| Ray | Elite 2 | Burgundy-red hair `#ca4048` |
| Ripresa | Elite 2 | Pale blonde hair `#fcebb6` |
| Scene | Elite 2 | Chartreuse equipment panels `#d4ee19` |
| Silence | Elite 2 | Red coat lining `#80394a` |
| Skadi | Elite 2 | Red clothing clasps `#491e37` |
| Snegurochka | Elite 2 | Near-black hair `#242830` |
| Snowsant | Elite 2 | Dark brown hair `#5a483c` |
| Surfer | Elite 2 | Royal blue jacket `#2452e8` |
| Sussurro | Elite 2 | Pale pink hair `#fee0df` |
| Suzuran | Elite 2 | Pale golden-green hair `#ded09a` |
| Swire | Elite 2 | Black skirt `#292222` |
| Texas the Omertosa | Elite 2 | Blue-violet sword effects `#313692` |
| Thorns the Lodestar | Elite 2 | Royal blue liquid `#06208b` |
| Totter | Elite 2 | Ash-brown hair `#73645e` |
| Tsukinogi | Elite 2 | Purple-blue effects `#313757` |
| Vendela | Elite 2 | Peach-copper hair `#e48b75` |
| Warmy | Elite 2 | Pale pink-beige hair `#ecd2bb` |
| Wind Chimes | Elite 2 | Dark navy hair `#292f44` |
| Windscoot | Elite 2 | Rust-red trousers `#91402e` |
| Wulfenite | Elite 2 | Beige-brown clothing `#e0cd9a` |
| Yu | Elite 2 | Orange lantern light `#fed1a7` |
| Yūtenji Nyamu | Elite 2 | Purple hair `#9f61a6` |
