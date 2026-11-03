# Music claim-risk exclusions

Stream-safe mode uses the existing per-recording `copyright` flag plus the credited
artist rules in `lib/music/claimRisk.ts`. This is a conservative playback exclusion
policy, not a determination of ownership or proof that unflagged music is claim-free.

Artist matches apply to artist/composer fields and structured credits during
catalogue generation. The reader also applies them to the artist field of existing
published catalogues, before queue entries copy the compact flag. New tracks inherit
the rule when their credits identify the flagged artist; missing credits cannot be
inferred from an MSR channel or label name.

## Yuki Hayashi — added 2026-11-03

The maintainer requested an artist-wide precaution after providing a YouTube Studio
claim screenshot naming Perish in Frost, Light and Shadow, Lungmen and Catastrophe.
This supports excluding those recordings; the broader artist rule is the maintainer's
chosen policy, not a claim that every recording has been individually reported.

Recognized name forms: Yuki Hayashi, Hayashi Yuki (including macrons), and 林ゆうき.
Existing per-song flags remain effective. Other named collaborators are not automatically
excluded: Magic Theorem and its instrumental remain available.

## Online research, 2026-11-03

No maintained, comprehensive Arknights artist claim list was found in the searches
performed. Do not treat that as proof that no community list exists.

- [Mili's official guidelines](https://projectmili.com/copyright-guidelines) explicitly
  mention automatic YouTube Content ID detection and declining individual inquiries
  about it. This is evidence for Mili, not a general list or a Twitch policy.
- [Community reports of 2020 claims](https://www.reddit.com/r/arknights/comments/i29asv)
  and [reports of their removal](https://www.reddit.com/r/arknights/comments/i4vg0x)
  are historical anecdotes, unsuitable as a current blanket exclusion list.
- [YouTube's music-credit explanation](https://support.google.com/youtube/answer/7680188)
  explains that music sections can result from claims or Audio Library music, and
  can also be absent despite identification/rights information. Credits alone do
  not establish a safe/unsafe distinction.

The previously considered rule excluding every non-MSR credited artist is deliberately
not implemented: it also removes ordinary soundtrack collaborators and composers.

## Existing exclusions and So Long, Adele — expanded 2026-11-03

At the maintainer's request, artist rules now also cover the lead artists/performers
of the catalogue's existing `copyright: yes` recordings:

- DJ Okawari, Ai Ninomiya: Speed of Light and instrumental.
- DJ Okawari, Kaori Sawada: Everything's Alright and instrumental.
- DJ Okawari, Stephanie: Your Star and instrumental.
- Low Roar: Feels.
- AIYUE, Rina: Heavenly Me and instrumental.
- Mili: Tie Hua Fei and HUA YU.

ZOEE is added from the maintainer's report about So Long, Adele's Misty Memory lobby
music. All three Misty Memory versions (day/night/acoustic) are excluded as a
precaution; explicit MSR and YouTube IDs cover already-published compact catalogues
that omit the performer credit. This is not evidence of a claim on every version.
The other composers/arrangers/engineers on those recordings are not blanket-blocked.
The artist association does not identify the claimant or establish that every
recording by that performer triggers Content ID.

Credits checked against the local catalogue, [Misty Memory's credits](https://arknights.wiki.gg/wiki/Misty_Memory),
and [Heavenly Me's distributor credits](https://linkco.re/bC86aE72?lang=en).
Magic Theorem (Adam Gubman / Sarah Kang) remains available.
