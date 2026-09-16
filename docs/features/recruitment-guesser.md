# Recruitment Guesser

Route: `/games/recruitment-guesser`. Depends only on the Games foundation. Color Palette data, artwork tooling, route and tests are excluded.

The operator roster is selected by `howToObtain.Recruitment === 'Yes'` (or the legacy Recruitment string), plus the Global release check. Questions exhaustively enumerate distinct pairs and triplets from effective recruitment tags. Every displayed tag must match, and six-star operators require Top Operator.

The complete matching pool must have **one to three operators**. Zero-answer and four-or-more-answer combinations are discarded. No low-rarity or guarantee-floor filtering is used to reduce the count. The game assumes all tags stick and does not impose a timer: Robots and Starters count. Correct answers stay found, wrong answers consume one of five mistakes, and repeated answers never consume another mistake. Winning requires every matching operator, not just one. Reveal/loss displays the full pool and marks the operators the player found.

Opening Recruitment Guesser immediately starts a round from the mixed pool of pairs and triplets, with no selection screen or Start button. The rules remain available within the round; Next combination starts another mixed-pool round after a win or reveal. At introduction the released roster supplies 378 questions: 108 pairs and 270 triplets. These are rebuilt from the operator data during the site build, rather than maintained by hand.

Inspired by [Kukkikaze's recruitment challenge](https://youtube.com/shorts/EkAa-Mtl8sY).

Validation: `npm run test:recruitment-guesser`, typecheck, lint, rendered-class check, and production build. The latest UI opens without a tagline or automatic scrolling.
