# Mechanics inventory

Walk the day's exercises and classify each against what the play
surface already renders. "Already rendered" means zero app code — the
day works the moment its data verifies.

## Already rendered (as of days 1–7)

- `find-square` exercises (click the named square).
- `reach-square` scenarios: star on the goal square, dots on legal
  targets, re-selection after each move.
- `capture-all` scenarios: red rings on capture targets, "red ring"
  hint on selecting a capturer, gobble feedback per capture.
- Moves budget: "Moves left: N" meta line, budget-exhausted failure.
- Promotion: board redraws whatever FEN the core returns; SAN containing
  `=` triggers the 👑 celebration copy (goal-met and mid-game variants).
- Multi-piece selection: clicking another movable piece re-selects it.
- Day chrome: badge, per-day chips, day-complete interstitial
  (wrapUp/teaser), band-complete screen (band `complete` copy) — all
  from `days[]` data.
- Node-level `hints.select` / `hints.illegal` with generic fallbacks.

## Needs app code (extend the inner loop)

- A goal type the `Goal` union doesn't have yet (core + verifier +
  types + surface, in that order).
- A result state the surface doesn't narrate (new `reason` strings).
- Any new visual affordance — and its explanation belongs in the
  prompt/hint DATA, with at most a generic pattern in TS.

## Needs a seam decision first (NOT day work)

- `rules: "standard"` scenarios — check/mate display, legal-move
  filtering under check (finding F2: paper pressure-test first).
- `opponent: "engine"` — reply moves, turn alternation UI (Maia seam).
- Anything requiring evaluation — `evaluate()` is a stubbed oracle.
