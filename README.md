# Chess Tutor — Foundation & The Basics, Days 1–7

The skeleton of a generative chess-teaching framework meant to run for
**years**, not days — the curriculum is a spiral of strands (board
vision, piece play, value, teamwork, king safety, later tactics,
endgames, whole games) that each recur at greater depth every year,
never a fixed lesson list. Days 1–7 are its first lap, "the Basics,"
hung on the skeleton now: **the board and all six pieces** (rook,
bishop, queen, knight, pawn, king), closing with piece values and
two-piece teamwork — all played as *Race*, *Gobble*, *value-pick* and
*army* mini-games with promotion along the way. Everything a future
agent layer will need is already load-bearing here — a truth core, a
constraint layer, a curriculum-as-data DAG with day pacing, a search
verifier, and a play surface — and **zero LLM is involved anywhere**.

Where this is going, and whose standards we build under:
[VISION.md](VISION.md). The working agreement (invariants, gates,
authoring discipline): [CLAUDE.md](CLAUDE.md).

## Try it

```bash
rustup target add wasm32-unknown-unknown
npm install -g wasm-pack pnpm

pnpm install
pnpm build:wasm       # Rust → one WASM artifact, used by browser AND Node
pnpm dev              # play the Basics at http://localhost:5173
```

Tests (each maps to a roadmap gate):

```bash
pnpm test:rust          # P1/P2: perft vs reference; per-piece equivalence; scenarios playable
pnpm test               # P0/P4/P5: WASM from Node, routing, verifier
pnpm verify:curriculum  # P5/P6: every exercise of days 1–7 proven solvable
pnpm build && pnpm --filter @chess/web e2e   # P3/P6: days 1, 2, 5, 7 in a browser
```

## Architecture

```
crates/truth-core      Rust, wraps shakmaty. THE only source of truth about
                       chess: legality, application, results, goals, perft.
                       Compiled once to WASM; browser and Node load the same
                       bytes, so there is no legality drift.
packages/core          Typed TS face of the core's tool API:
                       legalMoves / apply / result / evaluate (stub) /
                       scenarioLegalMoves / scenarioApply / scenarioResult /
                       scenarioOpponentMove / greedyMove (Pip in full games).
packages/curriculum    Curriculum as data (JSON, git-versioned): the whole
                       "Basics" band DAG with days 1–7 authored (check/mate
                       stubbed), every node tagged with its spiral strand,
                       day pacing and per-node hint copy as data; the outer
                       tutoring loop (router) with the eligible frontier
                       exposed — nextStep is one policy over frontier() —
                       and the learner-model stub behind an opaque
                       LearnerState (practice attempts timestamped for
                       the future retention model).
packages/verifier      Generate-then-verify: BFS over the core's restricted
                       move sets proves every exercise valid, solvable and
                       on-target BEFORE a learner sees it (in CI via
                       verify:curriculum, and again at serve time in the
                       client). Unsolvable exercises are refused.
packages/web           Play surface. Board UI with legal-move highlighting
                       driven by the core; the inner loop (correct → advance,
                       illegal → nudge, goal → celebrate); day sequencing,
                       day-complete celebrations and all lesson copy from
                       curriculum data. Three documents: the landing page
                       ("Who's playing?" — player profiles, one learner
                       state each), the lesson at /play.html, and the
                       story at /about.html.
```

### The constraint layer: mini-games as data

A `Scenario` restricts which pieces may move and replaces the win condition
— teaching a *subset* of chess. The Basics' scenarios use the
`rules: "movement"` model: piece movement, captures and blocking are
exactly real chess (generated from shakmaty's attack tables, never
hand-rolled), but there are no check semantics and kings are optional —
the honest model for lessons that come before the learner knows what
check is. `rules: "standard"` (full legality via shakmaty movegen) is
open for the band-2 check/mate lessons under decisions D1–D6
(docs/architecture-review.md): opponentless standard scenarios are
single-move exercises; goals span `capture-all`, `reach-square`,
`give-check`, `checkmate`, `escape-check` and `survive`; and the
deterministic `greedy` opponent (Pip) keeps verification a pure search.

```jsonc
{
  "id": "rook-gobble-02",
  "startFEN": "6p1/1p6/8/5p2/2p5/7p/8/4R3 w - - 0 1",
  "allowed": { "pieces": ["R"], "moves": "rook-lines", "castling": false },
  "goal": { "type": "capture-all", "targets": "p" },
  "opponent": "none",
  "movesBudget": null
}
```

## Decisions taken (roadmap §3 and §8)

- **Language gate:** TS monorepo + Rust→WASM core, as recommended. The
  agent layer later becomes a second client of the same tool API.
- **`unique` semantics:** the verifier reports `unique` = "exactly one
  minimal-length solution exists". Mini-games are gated on *completable*
  (`valid && solvable && onTarget`), never on uniqueness — `unique` is an
  authoring/generation signal that tactics will inherit.
- **Kingless mini-games:** shakmaty's standard rules refuse kingless or
  opposite-check positions, which opponentless mini-games produce
  constantly. Rather than bending full-rules parsing, the constraint layer
  owns a movement-subset model built on shakmaty's attack tables. Kings,
  when present, are scenery and can never be captured.
- **JS↔WASM serialization:** JSON strings with a uniform `{ok, data|error}`
  envelope on every core function; typed TS veneer on top.

## Seams left open (deferred, contracts in place)

| Deferred | Seam that already exists |
|---|---|
| Stockfish oracle | `evaluate()` returns `{status: "unavailable"}` |
| Maia-style opponent | `opponent: "engine"` in the Scenario schema (the deterministic `greedy` rung is SHIPPED; `engine` is the human-like upgrade behind the same field) |
| BKT/retention learner model | opaque `LearnerState` + `LearnerModel` interface; practice attempts carry timestamps, response latency and hint counts from the spiral alignment onward — earlier history is null-padded ([docs/retention-model.md](docs/retention-model.md)) |
| Spiral bands & frontier menus | `strand` tags on every node + `frontier()` beside `nextStep` |
| Generative content | verifier's `assertServable` gates anything proposed |
| Agent layer | the whole core tool API + verifier |
| Second domain | chess lives in core/verifier payloads; router/learner/loops are domain-blind |

## Curriculum status

"The Basics" band is authored, verified and playable through **seven
days / fifteen nodes**: board orientation, then movement + capture node
pairs for rook, bishop, queen, knight, pawn (marching, gobbling,
promotion) and king, closing with `piece-values` (take the best prize)
and `the-whole-army` (two-piece teamwork). Every piece's movement model
is equivalence-tested against full-rules shakmaty before its content
exists (F1 discipline), and every exercise's budget is proven tight
(budget = shortest solution).

Still stubbed, shaping the DAG until their days are authored:
`dont-hang-pieces`, `check-and-escaping-check` and `basic-mates`. Their
core seams are now OPEN — `rules: "standard"` with the check-family
goals (F2 closed, decisions D1–D6), the deterministic greedy opponent
(Pip) with the `survive` goal, danger-spotting `find-square`, and the
`game` kind for day 13 — and the band-2 day sheets (day-08…day-14) are
written as design specs. What remains is data authoring per sheet, plus
the full-game play surface for day 13.

The band is the first lap of a spiral, not the whole road: every node
carries a `strand` tag (board-vision, piece-play, value, teamwork,
king-safety — the threads later bands deepen), the router exposes the
learner's full `frontier()`, and practice attempts are timestamped from
here on so the future retention model inherits real history. The
multi-year shape: [VISION.md](VISION.md), "The shape of the journey".

## Docs

- [VISION.md](VISION.md) — destination, phases, non-goals, and the
  expert lenses each seam is built under.
- [CLAUDE.md](CLAUDE.md) — the working agreement: invariants, verify
  gates, voice, quick reference.
- [docs/architecture-review.md](docs/architecture-review.md) — findings
  F1–F7, ranked, with the ordered next steps.
- [docs/retention-model.md](docs/retention-model.md) — the BKT/retention
  seam sketch: what the future model must do, what is already recorded.
- [docs/curriculum/](docs/curriculum/) — human-readable lesson sheets,
  day-01 through day-07, each runnable cold by a non-player parent.
- [.claude/table-of-contents.md](.claude/table-of-contents.md) —
  on-demand reference: layout, gate→command map, authoring checklist.
