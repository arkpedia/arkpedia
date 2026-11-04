The base calculator as it was before the skill table replaced its hand-written handlers
(commit 4990c4e50), frozen so scripts/tests/test-base-skill-parity.ts can run the old and the
new calculator over the same staffings while the handlers are folded into the table. Nothing
else imports it. Deleted with the last handler.
