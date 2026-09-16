# Shared Games setup

The Games hub lists only implemented pages. This foundation relocates the existing
Operator Guesser to /games/operator-guesser, preserving its current game logic and
redirecting /guesser. New game PRs add their own canonical page, catalogue entry,
and legacy redirect. No unfinished game is linked.

GameLinks and its stylesheet are independent of the palette/recruitment games.
The shared game stylesheet preserves Arkpedia's standard container and theme
variables. Legacy Operator Guesser CSS remains for compatibility with independent
light-mode fixes until the replacement interface lands.

This branch contains no music game, new palette/recruitment game, Operator Guesser
redesign, Planner redesign, or Pull Planner. Their implementations are separate.
