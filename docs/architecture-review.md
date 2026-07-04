# Architecture Review — Day 1 Foundation

Reviewed at `7e0a8a1` (CI green). Scope: the whole foundation against the
roadmap's principles and the loads the agent layer will later place on it.

## Verdict

The foundation holds the load it was designed for. The five principles are
enforced structurally, not by convention: legality exists in exactly one
compiled artifact, nothing unverified can reach a learner (two independent
gates), and the pedagogy layer contains no chess knowledge. The riskiest
piece is not anything that exists — it is the **two rules models inside the
core** (movement vs standard), whose equivalence is currently proven only
for the rook. That is where drift would enter if unattended.

## Principles, checked against the code

1. **Core is the only truth.** Holds. The web UI's only chess-adjacent
   code is rendering a FEN's placement field and mapping clicks; every
   highlight, application, and result is a core call. The verifier
   derives solvability purely from `scenarioLegalMoves`/`scenarioApply`/
   `scenarioResult` — it makes no chess judgment of its own.
2. **Generate-then-verify.** Holds, twice: `verify:curriculum` in CI and
   `assertServable` in the client before render. Refusal is tested
   (unsolvable, malformed, off-target all rejected).
3. **Core surface is a tool API.** Holds. Deterministic JSON in/out with a
   uniform `{ok, data|error}` envelope and descriptive errors — already
   agent-callable as-is.
4. **One core, compiled twice.** Holds literally: Node tests read the same
   `truth_core_bg.wasm` bytes the browser fetches.
5. **Curriculum is data.** Holds: one JSON file, structurally validated at
   load, chess-validated by the verifier.
6. **Domain↔pedagogy seam.** Holds: router, learner model, and mastery
   rules import nothing chess-specific; chess lives behind the `Exercise`
   union payload.

## Deliberate deviations from the roadmap (with rationale)

- **`result(FEN, goal?)` was split** into `game_result(fen)` and
  `scenario_result(scenario, fen)`. Goal evaluation needs budget and
  start-position context that a bare goal argument cannot carry. The
  roadmap's signature is expressible as a trivial wrapper if the agent
  layer wants it; revisit when freezing the agent-facing API.
- **Mini-games use a `rules: "movement"` model, not filtered standard
  legality.** Forced by reality: standard chess (and shakmaty's strict
  validation) refuses kingless boards and opposite-check positions, both
  of which opponentless mini-games produce constantly — the roadmap's own
  Gobble FEN is kingless. The movement model is also the pedagogically
  honest subset for pre-check learners. Movement/captures/blocking are
  generated from shakmaty's attack tables, not hand-rolled geometry.
- **No server tier yet.** Curriculum, verifier, and loops run in the
  client (and in Node for CI). The seam is the package boundary: a server
  is "host the same packages behind HTTP," no rewrite. Defensible for
  Day 1; becomes real work the moment learner state must be trusted.
- **The WASM artifact is gitignored.** Contributors need the Rust
  toolchain; CI rebuilds from source. Chosen to avoid a stale-binary
  class of bugs; the cost is a heavier onboarding step (documented).

## Findings, ranked

### F1 (highest): two move-generation paths in the core — MEDIUM today, HIGH as content grows
`engine.rs` (standard, shakmaty movegen) and `scenario.rs` (movement
model, shakmaty attack tables) can drift apart per piece. Equivalence is
test-proven for the rook only. **Recommendation:** before authoring each
new piece node (bishop next), add the corresponding
movement-vs-standard equivalence test — same shape as
`movement_matches_real_rook_geometry`, including blocked and capture
cases; pawns deserve several (pushes, double-push, captures, promotion).
Make this a checklist item for authoring, not an afterthought.

### F2: the `rules: "standard"` seam is declared but its intended use is unexamined — MEDIUM
The roadmap owed a paper pressure-test of the scenario schema against
forks/pins before freezing. Pins only exist under standard rules, and the
open question is real: opponentless standard-rules scenarios reintroduce
the opposite-check problem the movement model was built to avoid.
Likely resolution: standard-rules scenarios are inherently
opponent-bearing (they teach check — someone must answer), so turn-reset
never applies to them; but that should be decided on paper *now*, before
more schema consumers exist. **Recommendation:** write two throwaway
scenario JSONs (a pin, a fork) and confirm the schema expresses them;
record the decision in the schema docs.

### F3: hand-mirrored Rust↔TS wire types — MEDIUM
`packages/core/src/types.ts` mirrors the serde types by eye. Round-trip
tests catch gross drift but not, e.g., an optional field added on one
side. Fine at 8 functions; wrong at 20. **Recommendation:** adopt
`ts-rs` (or JSON Schema emitted from Rust) once the API grows again, and
make the generated types the only TS source of truth.

### F4: verifier BFS lives in TS, one WASM call per edge — LOW today, MEDIUM for tactics
Day 1 worst case is a few hundred thousand boundary crossings, well under
a second. It will not survive standard-rules tactical verification.
**Recommendation:** when that day comes, move the search into the core
(`verify_scenario` in Rust) — solvability is arguably a chess fact and
the core is its natural home; the TS verifier then becomes orchestration
plus the on-target policy check. No interface change needed for callers
of `verifyExercise`.

### F5: the FEN fullmove counter doubles as the budget clock — LOW
Semantic overloading: `scenario_apply` bumps fullmoves so `movesUsed`
survives the FEN round-trip, and the verifier strips counters from its
dedup key to compensate. It works and is tested, but it is the kind of
cleverness that surprises later readers, and it quietly zeroes the
halfmove clock. **Recommendation:** document it where scenario FENs are
authored; if it ever leaks confusion, replace with an explicit
`ScenarioState {fen, movesUsed}` wire object.

### F6: a scenario already solved at its start position is servable — LOW
`searchScenario` returns `solvable, minSolutionLength: 0` and the serve
gate passes it; the learner would face a puzzle with nothing to do (the
UI only evaluates results after a move). Cannot happen with the current
authored data, but the gate should refuse degenerate content on
principle. **Recommendation:** tighten `servable()` (or the scenario
branch of `verifyExercise`) to require `minSolutionLength >= 1`.

### F7 (cluster): accepted small debts — LOW
- `movement_san` is a second, presentation-only notation implementation.
- `board.ts` parses FEN placement for rendering (presentation-only
  duplication; it asserts no legality).
- The router serves nodes in authored order; validation checks acyclicity
  but not that authored order is topologically sensible — a
  badly-ordered file would still be *correct* (prereqs gate serving) but
  would present nodes in a confusing sequence.
- The client's verify cache pins rejections for the session — arguably
  correct (a refused exercise should not flicker back), worth knowing.
- The learner-model window forgets failures by design; real mastery
  modeling is the BKT seam's job.

## Scaling forecast — what breaks first, in order

1. **Authoring volume** hits F1 (per-piece equivalence discipline) and F2
   (standard-rules decision) as soon as Day 2 content starts.
2. **Tactical exercises** hit F4 (search placement) and bring Stockfish in
   through the already-stubbed `evaluate()`.
3. **An agent layer** hits F3 (type generation) and wants the unified
   `result(FEN, goal?)` wrapper; everything else it needs — deterministic
   tool API, verifier gate, curriculum as data — already exists.
4. **Trusted progress / multi-device** forces the server tier; the
   packages are ready to host, but learner-state authority moves
   server-side then.

## Suggested next steps (in order)

1. Paper pressure-test the schema on a pin and a fork; record the
   standard-rules/opponent decision (F2).
2. Tighten the serve gate against zero-move scenarios (F6) — one line
   plus a test.
3. Author `bishop-movement`/`bishop-capture` with the per-piece
   equivalence test as part of the definition of done (F1).
4. Adopt generated wire types before the API surface grows again (F3).
