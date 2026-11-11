# Playback source review, 2 November 2026

This is a source/implementation inventory, not a grant of music rights. The owner
asked to keep the existing YouTube behavior unchanged during account preparation.

| Source | Current delivery | Unresolved permission boundary |
| --- | --- | --- |
| YouTube | IFrame player; no extracted audio or server video copies | Hidden-player playback conflicts with Developer Policies III.I.9, even for static artwork. It remains unresolved, not approved as compliant. |
| Monster Siren | `/api/music-audio/[id]` redirects to the official signed CDN URL. R2 stores short-lived URL metadata, not audio files. The browser can preload one track into temporary memory. | Public listening access has been verified; a licence covering third-party background playback or rehosting has not. Do not add persistent song caching or claim those rights. |
| Endfield / collaboration recordings | Catalogue entries use their listed provider; a verified recording confirms what the track is, not rights to reuse it | Do not generalize one publisher's fan policy to another publisher or a standalone music service. |

Official sources reviewed:
- https://developers.google.com/youtube/terms/developer-policies#i.-additional-prohibitions
- https://monster-siren.hypergryph.com/music
- https://endfield.gryphline.com/en-us/news/4497

The Endfield guidelines describe fan creations and gameplay streaming, with conditions
and third-party-rights exclusions; they do not establish blanket permission for an
independent music player. Any rights-holder permission should identify the tracks,
delivery method and allowed use. No rights-holder was contacted by this work.

Music remains opt-in and independent of analytics. Consent to contact a provider is
not permission from a rights holder. A future YouTube correction should retain a
properly visible player while playing; background-only audio needs a permitted source.
