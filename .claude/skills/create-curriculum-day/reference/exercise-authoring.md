# Exercise authoring rules

## The arc (4 exercises per node)

1. **Intro** — the move in its purest form; tight budget (1–2 moves)
   so the mechanic IS the solution.
2. **Discovery** — the surprising property, found not told: a blocker
   forcing a detour, the knight jumping a fence, the stuck pawn, the
   promotion. Budget = proven minimum.
3. **Volume/efficiency** — a gobble for joy (unbudgeted) or an
   "every move must capture" chain (budget = capture count).
4. **Checkpoint** (`assessment`) — a clean re-test of the core move,
   no twist, prompt starts with "Checkpoint:".

## FEN rules

- Author every startFEN with counters `0 1` — the fullmove counter is
  the scenario budget clock (F5).
- Chess-natural positions only: no pawns on ranks 1 or 8; kings only as
  scenery (they can never be captured); pieces where a child's real
  board could plausibly have them.
- Reach-square goals for a bishop must target the bishop's own color.
- Promotion goals name the piece the pawn BECOMES:
  `{"type": "reach-square", "square": "b8", "piece": "Q"}`.
- Multi-target captures list every letter: `"targets": "pr"` means all
  black pawns AND all black rooks.

## Budgets

- Budgeted ⇒ tight: budget == shortest solution, proven by the
  band-wide test. If the verifier finds a shorter line, TIGHTEN.
- Unbudgeted ⇒ recoverable joy: wandering is allowed; the state space
  of gobbles is tiny, BFS stays fast.
- Value-pick pattern: budget 1, `targets` = only the valuable piece;
  taking the decoy exhausts the budget and fails — the failure IS the
  lesson.
- Teamwork pattern: budget == target count forces every move to
  capture, so no single piece can finish alone (verify one piece truly
  cannot reach some target).

## Prompts and hints (playtest-derived — a real 7-year-old's feedback)

- **Explain every affordance the first time a node relies on it**: the
  star ("the starred square"), the red ring ("a red ring means you can
  gobble that piece"), the counter is automatic. The kid figured out
  the red ring alone — they shouldn't have had to.
- One sentence of teaching + one of instruction. Child voice: playful,
  concrete, zero jargon. Numbers in prompts ("in 2 moves") must match
  the budget exactly.
- `hints.select` — what to click first, naming the piece ("Click your
  bishop to see where it can glide.").
- `hints.illegal` — the movement rule as a nudge, ending with "Pick one
  of the marked squares." Never "wrong" — restate the rule.
- Mastery `n` stays small (2, plus checkpoint): the on-screen counter
  shows `n + 1` puzzles; a day should feel finishable.

## On-target discipline

`teaches.pieces` must cover the union of every exercise's
`allowed.pieces`; `teaches.goalTypes` the union of goal types. The
verifier refuses anything the node doesn't declare it teaches.
