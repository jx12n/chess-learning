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

---

## Addendum — after Days 2–7 (the Basics authored end-to-end)

Status of the findings once the full seven-day band shipped:

- **F1 — closed for the Basics.** Movement-vs-standard equivalence is
  now test-proven for all six pieces (rook, bishop, knight, queen,
  king, pawn — pushes, captures, black direction), and the movement
  model's *intentional* divergences are themselves tests:
  no check semantics (`king_movement_model_omits_check_semantics_by_design`),
  auto-queen promotion, no en passant. Drift between the two rules
  models is caught per piece in CI.
- **F6 — closed.** `servable()` requires `minSolutionLength >= 1`;
  degenerate already-solved scenarios are refused, with a test.
- **F2 — still open, now the top item.** The next unauthored nodes
  (`check-and-escaping-check`, `basic-mates`) sit directly behind the
  `rules: "standard"` seam; the pin/fork paper pressure-test should
  happen before they are attempted. `dont-hang-pieces` additionally
  waits on the opponent seam.
- **F3 / F4 — unchanged.** Verifier BFS over the band's 62 exercises
  runs in ~1.3 s in CI (well inside budget); wire types are still
  mirrored by hand at the same function count.
- **New band-wide property:** every budgeted exercise's budget is
  proven equal to its shortest solution (`verify:curriculum` asserts
  it), so "efficiency" puzzles cannot silently go slack as FENs are
  edited. Day pacing (`days[]`), per-node hint copy, and the band
  completion copy are curriculum data validated at load — the play
  surface no longer hardcodes any lesson content.
- **Authoring playbooks** now live as skills:
  `.claude/skills/create-curriculum-day/` (tests → data → verify →
  lesson sheet) and `.claude/skills/build-day-experience/` (mechanics
  inventory → data-driven copy → e2e → operator walk).
- **F2 — closed (band 2 pre-work).** The paper pressure-test ran
  against five probe scenarios (mate-in-1, give-check, escape-check,
  pin, fork). Decisions, binding on the schema:
  - **D1 — standard rules never turn-reset.** Turn alternation *is* the
    rules. Opponentless `rules: "standard"` scenarios are single-
    learner-move exercises (`movesBudget: 1`, core-enforced); anything
    multi-move under standard rules must be opponent-bearing. This
    dissolves the opposite-check worry the finding predicted: a
    one-move exercise never gives the "opponent" a turn to be skipped.
  - **D2 — goal vocabulary grows by four.** `give-check`, `checkmate`,
    `escape-check` (standard-only; judged by shakmaty on the resulting
    position; `escape-check` additionally validates the start position
    IS check), and `survive` (movement rules + opponent). `capture-all`
    and `reach-square` work under both rules models (castling reaches
    a `reach-square` goal honestly — the king lands on g1/c1).
  - **D3 — the first opponent is `greedy`, not `engine`.** Deterministic:
    highest-value capture, lexicographic UCI tiebreak, lexicographic
    first move when no capture exists. Constraints bind the LEARNER
    only; the opponent moves its whole army. Budgets count learner
    moves only. Deterministic opponents keep verification a pure
    search (one reply per position — no minimax); `engine` stays the
    deferred seam for the Maia-style upgrade.
  - **D4 — budget clocks.** The movement model keeps the F5 fullmove
    clock. Standard-rules scenarios need no clock hack: learner moves
    derive from honest FEN ply arithmetic.
  - **D5 — fork-production goals are band 3.** "Attack two things at
    once" needs a `win-material`-family goal verified against defense
    (F4's minimax). Recorded gap; the enum extends without structural
    change. Pin recognition and pin exploitation are expressible today.
  - **D6 — two content classes join `scenario`.** `find-square` gains
    an optional `fen` (danger-spotting: the answer square is *proven*
    by the verifier against core-generated enemy captures; danger FENs
    are authored enemy-to-move so no side-flipping surgery exists
    anywhere). A `game` kind serves full games vs. a named opponent —
    unverifiable-by-design for solvability; its serve gate checks
    start-position legality and a supported opponent, nothing more.
- **Spiral groundwork (after the Basics shipped).** The multi-year
  shape is now explicit in the seams rather than implied: every node
  carries a `strand` tag (all-or-nothing per band, validated), the
  router exposes the eligible `frontier()` with `nextStep` reduced to
  one policy over it, and practice attempts are timestamped
  (`AttemptEvent.at`, stored by the stub, read by nothing yet;
  assessments keep only pass/fail — an accepted loss recorded in the
  seam sketch) so the future retention model inherits real history
  instead of starting blind.
  Product framing follows suit: band completion reads as a doorway,
  not an ending. Destination: VISION.md "The shape of the journey";
  seam contract: docs/retention-model.md.

---

## Addendum — the band-2 foundation (seams opened, reviewed, hardened)

The core work behind days 8–14 shipped as one foundation pass:
`rules: "standard"` scenarios per D1–D2 (give-check / checkmate /
escape-check goals; castling honored, with the wire reporting the
king's landing square so the click and the reach-square goal agree),
the deterministic `greedy` opponent per D3 (plus `survive`,
`scenario_opponent_move`, and `greedy_move` for full games),
danger-spotting `find-square` + the `game` kind per D6, and attempt
instrumentation (`latencyMs`, `hintCount` on `AttemptEvent` — stored by
the stub, read by nothing yet; recognition speed is the signature of
chunking, and history not captured now is gone). The verifier folds
deterministic replies into its single-agent BFS — explicitly gated on
`opponent === 'greedy'` so a future stochastic `engine` can never fold
by accident — and survive-goal dedup keys on BFS depth, never on the
wire's move counters. Gates at close: 53 Rust / 163 Node / 103
curriculum verifications / 15 e2e, clippy and typecheck clean.

- **D3 amendment (recorded at the greedy-promotion fix).** Greedy's
  pick maximizes material GAIN — captured piece plus promotion piece —
  with the lexicographic-UCI tiebreak unchanged. The original wording
  ("highest-value capture") let promotion ties fall to alphabetical
  UCI, which underpromoted to a bishop ("…b" < "…q"). Still fully
  deterministic; verification is unaffected.
- **Review record.** The foundation ran a seven-dimension review with
  adversarial verification of every finding (18 confirmed, 0 refuted).
  Both CRITICALs are fixed with pinning tests: (1) castling
  `MoveInfo.to` reported shakmaty's internal rook square, contradicting
  the D2 castling goal — the wire now reports g1/c1; (2) a stuck
  movement-model OPPONENT was scored as the learner's failure
  (`no-legal-moves`) and pruned as unsolvable by the verifier — a
  trapped opponent is maximum safety, and `scenario_result` now defers
  so the documented turn-pass-back is reachable. Failure reasons became
  a typed wire contract (`REASON_*` consts ↔ `ScenarioFailureReason`),
  and the play surface's goal copy is exhaustiveness-checked so a new
  goal type fails typecheck instead of falling through to bland copy.
- **F3 — hardened, adoption scoped.** The hand-mirrored wire types are
  now pinned by a drift suite (every TS-constructible goal/opponent
  marshals through the real WASM; core outputs assert exact key sets).
  ts-rs adoption was attempted (dependency resolvable, `serde-compat`
  viable) and deliberately deferred as its own change: the
  `default`/`skip_serializing_if` optionality asymmetry needs
  per-field `ts(as/optional)` annotations and a build step, too much
  rider for a foundation diff.
- **F4 — unchanged, boundary clarified.** Deterministic opponents fold
  into BFS (one reply per position), so mate-in-2 **vs. greedy**
  verifies today. F4's trigger remains *best-defense* claims (minimax)
  — and the game kind's puzzle-shaped gate workaround
  (`minSolutionLength: 1` recording "a first move exists") should be
  redesigned into the report shape when verification moves into the
  core.
- **F5 — narrowed.** D4 confines the fullmove budget clock to the
  movement model; standard rules use honest ply arithmetic (now with a
  predates-start guard), and the verifier no longer reads wire counters
  for anything — its depth-keyed dedup counts its own walk.
- **F8 (new, low): the danger-spotting probe.** The verifier proves
  danger squares by synthesizing a movement-model probe scenario whose
  goal is inert boilerplate the move query never reads. Single-site,
  commented, test-guarded — but the honest shape is a first-class core
  query ("capture targets of the side to move"); add it when a second
  consumer appears (the day-10 mate-or-not quiz is a candidate).
