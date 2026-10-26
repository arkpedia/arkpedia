# Privacy surfaces and release review

The privacy work lives with PR778; it has not been released. The source records
Mocchibird / JungerMin as current maintainer and privacy contact, using the
user-provided github@mail.mocchibird.com address. Kukkikaze is credited as founder.
Do not infer a legal name, postal address or country from usernames or machine data.

Implemented:
- About, Privacy notice and Cookies & privacy choices are linked from About;
  Settings also links choices, and the signed-out account screen links the notice.
- Analytics is off without a valid explicit choice, including the Vercel sampling
  session flag. Missing, corrupt, future and 180-day-expired records fail closed.
- External playback asks before loading the YouTube API or priming external audio.
  Event embeds use the same prompt. Existing public images/thumbnails still load
  as ordinary page assets and are disclosed in the notice.
- Withdrawal reloads the current document and other open tabs which have optional
  services enabled, retiring loaded scripts/players. Consent is browser-only and
  deliberately excluded from cloud saves and backups.
- Necessary sign-in and user-requested browser saves are explained separately.
  A compact first-visit statistics prompt offers equally styled allow/refuse actions.
  Closing refuses analytics. Media permission never makes the analytics decision.
  The choices page supplies the same controls without a duplicate floating prompt.

Before a public release, confirm the responsible operator's legal identity/contact
requirements and jurisdiction (country has not been supplied), provider agreements
and international-transfer arrangements, and the actual hosting/relay log and D1
backup retention settings. Do not describe this source review as GDPR certification.
The notice states retention criteria rather than inventing unverified fixed periods.
Check the deployed network/cookie journey for a fresh browser, both analytics
providers, sign-in, consent refusal/withdrawal, media playback and remembered import.
This is especially important before the Vercel → Cloudflare domain cutover.

References used for the review:
- https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm
- https://www.edpb.europa.eu/sme/find-practical-info/faq_en
- https://vercel.com/docs/analytics
- https://developers.cloudflare.com/web-analytics/about/
- Account schema and session settings: lib/cloud-account/server.ts
- Game-login boundary: lib/account-import/savedLogin.ts

Do not reuse another fan project's privacy assertions or licence for Arkpedia.
Arkpedia has accounts, optional cloud saves, media and supporter links; a claim that
it collects no personal data or never accepts donations would be inaccurate.

The redesigned public notices target the Cloudflare deployment only, as requested by
the maintainer. They omit Vercel provider references; legacy Vercel infrastructure
is outside this UI change. The usage-statistics setting now explains page views,
visits and loading performance in plain language.
