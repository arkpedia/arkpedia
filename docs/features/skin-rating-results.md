# Skin-rating results

The Drip Awards ranking provides a Weighted Rating checkbox, enabled by default.
Turn it off for the original raw-average ranking. Its URL state survives view changes,
search and reloads. Podium order, tier bands, rank numbers and the Detailed table use
the selected score. Detailed statistics can also be sorted by individual columns.

The Bayesian score is `(rating total + 20 × community mean) / (rating count + 20)`.
The community mean is weighted by all votes on known skins, computed before search
and shared by skin and operator views. This tempers small samples without changing
votes, raw averages, histograms or percentiles. Equal scores share a rank; vote count
and name provide deterministic display order. Unrated entries remain excluded.
Operator community results continue pooling all votes across that operator’s skins.

Your score shows only the authenticated account’s confirmed saved ratings. For an
operator it averages only the skins that account rated, with the rated-skin count.
The difference compares that score with the raw community average. Unrated entries
show a dash. Switching accounts clears the previous account’s scores. Personal data
is not added to the public aggregates, and ranking switches do not write ratings.

The raw average and vote count remain visible next to weighted scores. The existing
results-help popover explains the method. Distribution dialogs and full-artwork
viewers retain the original ratings and return to the selected ranking context.
