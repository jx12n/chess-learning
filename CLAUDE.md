# Chess Tutor

Generative chess-teaching framework: a deterministic Rust→WASM truth
core, mini-games as data (the constraint layer), a curriculum-as-data
DAG, a search verifier, and a web play surface. Day 1 (board + rook) is
real end-to-end; zero LLM anywhere yet. Destination and guiding lenses:
[VISION.md](VISION.md).

## Critical rules

- **One truth.** `crates/truth-core` is the only source of chess truth.
  No legality, geometry, or result logic anywhere else: the web UI may
  only render FEN placement and map clicks; the verifier only
  orchestrates core calls, never judges chess itself.
- **Never hand-roll chess.** Movement subsets derive from shakmaty's
  attack tables, full rules from shakmaty movegen. A new piece node
  requires its movement-vs-standard equivalence test (shape of
  `movement_matches_real_rook_geometry`, with blocked and capture
  cases) *before* content is authored.
- **Generate-then-verify.** Nothing reaches a learner unverified:
  `verify:curriculum` gates CI, `assertServable` gates render. Never
  weaken or bypass either gate — unsolvable, malformed, or off-target
  content is refused, not silently fixed up.
- **Curriculum is data.** Lessons and exercises live in
  `packages/curriculum/data/*.json`. Never hardcode content in TS or
  Rust.
- **Pedagogy stays domain-blind.** `router.ts` and `learner.ts` import
  nothing chess-specific; chess stays behind the `Exercise` payload.
  This seam is what makes a second domain possible — protect it.
- **Tool-API discipline.** Every core function speaks JSON with the
  uniform `{ok, data|error}` envelope and descriptive errors; the agent
  layer will call this surface as-is. Rebuild WASM (`pnpm build:wasm`)
  after any `crates/` change — browser and Node load the same bytes.
- **Shipping gates:** empathy before scoping · owner verdict on scope ·
  operator walk before "done" · milestone-verify at close.

## Voice

Lesson content serves two users. The **child** (age 7): one concept per
lesson, short bursts, playful, praise the thinking over the answer,
stop while it's still fun. The **parent-coach** (likely a non-player):
every lesson runnable cold from its script. When touching a seam, adopt
the expert lens that owns it — table in [VISION.md](VISION.md).

## Quick reference

```bash
pnpm build:wasm         # Rust → WASM (after any crates/ change)
pnpm test:rust          # core: perft vs reference, scenarios playable
pnpm test               # WASM from Node, routing, verifier
pnpm verify:curriculum  # every authored exercise proven solvable
pnpm typecheck
pnpm dev                # play Day 1 at http://localhost:5173
pnpm build && pnpm --filter @chess/web e2e   # Day 1 in a real browser
```

Each is a CI gate — run the ones your change touches before declaring
done.

## Find your guide

| If you need to… | Read |
|---|---|
| Understand the destination, phases, whose lens leads | [VISION.md](VISION.md) |
| See architecture, decisions taken, open seams | [README.md](README.md) |
| Check current findings and next steps | [docs/architecture-review.md](docs/architecture-review.md) |
| Author or review lesson content | [.claude/table-of-contents.md](.claude/table-of-contents.md) (authoring checklist) + [docs/curriculum/day-01.md](docs/curriculum/day-01.md) |

**Reference (on-demand):** [.claude/table-of-contents.md](.claude/table-of-contents.md)
— layout, gate→command map, authoring checklist, setup, known cleverness.
