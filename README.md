# Chess Tutor — Foundation & Day 1

The skeleton of a generative chess-teaching framework, with one real lesson
hung on it: **Day 1** (board orientation → rook movement → rook capture,
played as the *Race* and *Gobble* mini-games). Everything a future agent
layer will need is already load-bearing here — a truth core, a constraint
layer, a curriculum-as-data DAG, a search verifier, and a play surface —
and **zero LLM is involved anywhere**.

Where this is going, and whose standards we build under:
[VISION.md](VISION.md). The working agreement (invariants, gates,
authoring discipline): [CLAUDE.md](CLAUDE.md).

## Try it

```bash
rustup target add wasm32-unknown-unknown
npm install -g wasm-pack pnpm

pnpm install
pnpm build:wasm       # Rust → one WASM artifact, used by browser AND Node
pnpm dev              # play Day 1 at http://localhost:5173
```

Tests (each maps to a roadmap gate):

```bash
pnpm test:rust          # P1/P2: perft vs reference; Gobble/Race playable
pnpm test               # P0/P4/P5: WASM from Node, routing, verifier
pnpm verify:curriculum  # P5/P6: every Day 1 exercise proven solvable
pnpm build && pnpm --filter @chess/web e2e   # P3/P6: full Day 1 in a browser
```

## Architecture

```
crates/truth-core      Rust, wraps shakmaty. THE only source of truth about
                       chess: legality, application, results, goals, perft.
                       Compiled once to WASM; browser and Node load the same
                       bytes, so there is no legality drift.
packages/core          Typed TS face of the core's tool API:
                       legalMoves / apply / result / evaluate (stub) /
                       scenarioLegalMoves / scenarioApply / scenarioResult.
packages/curriculum    Curriculum as data (JSON, git-versioned): the whole
                       "Basics" band DAG with Day 1 authored and the rest
                       stubbed; the outer tutoring loop (router); the
                       learner-model stub behind an opaque LearnerState.
packages/verifier      Generate-then-verify: BFS over the core's restricted
                       move sets proves every exercise valid, solvable and
                       on-target BEFORE a learner sees it (in CI via
                       verify:curriculum, and again at serve time in the
                       client). Unsolvable exercises are refused.
packages/web           Play surface. Board UI with legal-move highlighting
                       driven by the core; the inner loop (correct → advance,
                       illegal → nudge, goal → celebrate); Day 1 sequencing.
```

### The constraint layer: mini-games as data

A `Scenario` restricts which pieces may move and replaces the win condition
(`capture-all`, `reach-square`) — teaching a *subset* of chess. Day 1
scenarios use the `rules: "movement"` model: piece movement, captures and
blocking are exactly real chess (generated from shakmaty's attack tables,
never hand-rolled), but there are no check semantics and kings are optional
— the honest model for lessons that come before the learner knows what
check is. `rules: "standard"` (full legality, for the later check/mate
nodes) is declared in the schema and rejected by the core until a lesson
needs it.

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
| Maia-style opponent | `opponent: "engine"` in the Scenario schema |
| Full-rules scenarios (check/mate lessons) | `rules: "standard"` in the schema |
| BKT learner model | opaque `LearnerState` + `LearnerModel` interface |
| Generative content | verifier's `assertServable` gates anything proposed |
| Agent layer | the whole core tool API + verifier |
| Second domain | chess lives in core/verifier payloads; router/learner/loops are domain-blind |

## Curriculum status

"The Basics" band is fully schematized; Day 1 nodes
(`board-orientation`, `rook-movement`, `rook-capture`) are authored,
verified and playable. `bishop-movement`, `bishop-capture`,
`knight-movement`, `king-movement`, `pawn-move-and-capture`,
`queen-movement`, `piece-values-dont-hang`, `check-and-escaping-check`
and `basic-mates` are stubs that shape the DAG and block routing until
authored.

## Docs

- [VISION.md](VISION.md) — destination, phases, non-goals, and the
  expert lenses each seam is built under.
- [CLAUDE.md](CLAUDE.md) — the working agreement: invariants, verify
  gates, voice, quick reference.
- [docs/architecture-review.md](docs/architecture-review.md) — findings
  F1–F7, ranked, with the ordered next steps.
- [docs/curriculum/day-01.md](docs/curriculum/day-01.md) — the
  human-readable Day 1 lesson sheet (board + rook).
- [.claude/table-of-contents.md](.claude/table-of-contents.md) —
  on-demand reference: layout, gate→command map, authoring checklist.
