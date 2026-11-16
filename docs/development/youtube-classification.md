# Automatic YouTube categories

The content preparation job classifies public video metadata with TypeSafe's Jev.
The website consumes saved categories from its immutable content release; reader
requests never call TypeSafe. Event, operator and outfit priority still follows
Global availability windows independently of category assignment.

## Configuration and activation

Add the repository Actions secret `TYPESAFE_API_KEY` in
https://github.com/arkpedia/arkpedia/settings/secrets/actions. It is passed only to
the classification and explicitly invoked evaluation steps, never to the website
build or production Worker. `TYPESAFE_MODEL` may select another model when running
the producer locally; the default is `jev-latest`.

After the application release is live, run **Prepare content** on main with
`refresh_upstream=true` to classify existing videos immediately, or let the next
scheduled preparation do it. The public data record is
`data/youtube-video-topics.json`, carried in `/community`'s internal `videoTopics`
props and removed before browser delivery. This record participates in release
input hashes, so category updates require no new application deployment.

## Inputs, cache, and fallbacks

`scripts/sync/jev-video-classifier.ts` owns the typed Choice question, all nine
category descriptions, and the API adapter. State contains public title, creator,
up to 2,000 description characters, and matching canonical operator/outfit names.
No account information, browsing history, video downloads, or API key appears in
state. `scripts/sync/sync-youtube-topics.ts` reads the newest six uploads per curated
channel plus the historical discovery archive. A run attempts at most 160 new or
changed records, eight at a time; deferred records remain on the rules fallback.

The cache retains at most 2,500 records, matching video ID and a SHA-256 of the
metadata. Metadata edits, policy-version changes, a selected-model change, or a
30-day age make a record eligible for classification again. Individual cached
answers store the actual returned model, probability, confidence, policy version,
and check time. Low-certainty answers are cached too so they do not cost a new
request on every run. A policy/question change must increment
`TOPIC_POLICY_VERSION`.

Initially accept a category only when its probability is at least 0.8 and the
answer confidence is at least 0.6. These are conservative starting thresholds,
not measured accuracy guarantees. Editorial operator-guide associations take
precedence. An uncertain answer whose title consists entirely of multiple distinct
canonical operator names (plus game branding) uses an operator-showcase fallback,
unless its introduction explicitly names another genre. This applies to existing
cached abstentions too, without another API call. These deterministic assignments
use `model: catalogue-v1`; `fallbackFrom` retains the model's original uncertainty.
An uncertain/missing/invalid answer or changed metadata otherwise uses the title
rules. A failed request is logged as a failure and does not replace a successful
cached entry. A total provider outage reports a failed classification step;
content preparation continues with retained categories and rules.

## Verification

`test-youtube-topics.ts` exercises the real request and response contract, validation,
uncertainty, metadata/policy invalidation, category precedence, deduplication and
content-record wiring with a mocked provider. Browser category tests cover the
reported review, name-only operator showcase and trailers at both viewport sizes
and themes. These tests do not spend API credits.

**Evaluate YouTube categories** runs 20 labeled public examples once when this
integration's PR opens, and on explicit manual dispatch. It uses the repository
secret and uploads the exact public request/answer pairs. Acceptance requires all
four screenshot examples and at least 85% of the complete sample to match the
labels. This small sample is an integration check, not a general accuracy claim.
Manual reruns spend another 20 calls and require a corresponding authorized budget.

## Iteration two: experimental thumbnail probe

The initial metadata/catalogue version is released independently. TypeSafe currently
labels [image support](https://docs.typesafe.ai/images) experimental and not ready
for production. Thumbnail inference is therefore a manual evaluation only: it is
not imported by content preparation, the website or its Worker, and writes no
category assignments to the published record.

Run `node --import tsx scripts/audits/evaluate-youtube-thumbnails.ts` to download and
inspect the four reported examples without making a TypeSafe request. After an
authorized budget, the existing **Evaluate YouTube categories** workflow's
`thumbnails` mode makes at most four calls, without retries. It sends only public
metadata, matching public character names and one unmodified public thumbnail per
call. The API key remains in the runner secret. This probe can use the four calls
remaining from the original 24-call experiment budget; reruns need a new budget.
Manual dispatch defaults to `thumbnail-dry-run`; select `metadata` explicitly for
the existing 20-call text evaluation.

The adapter uses the required `TypeSafe-Danger-Zone-Images: true` header and multipart
uploads. Thumbnails come only from canonical YouTube `hqdefault.jpg` addresses,
with redirects rejected, a 256 KiB download cap, and the provider's pixel bounds.
Artifacts include exact request JSON, thumbnail bytes and hashes, full typed
answers, and accepted categories. The existing probability/confidence thresholds
still apply. No automatic escalation or production activation occurs.

These four examples are regression controls, already correctly categorized by
the released hybrid. Passing them proves integration compatibility, not improved
accuracy. Before activation, evaluate additional uncertain examples and misleading
thumbnails, compare against the metadata/catalogue baseline, and version/cache
image decisions using thumbnail content hashes because thumbnails can change at
the same URL. Keep a metadata-only fallback for missing images and provider errors.
