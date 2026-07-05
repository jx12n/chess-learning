# Chess Tutor

Generative chess-teaching framework built to run for years, not days: a
deterministic Rust→WASM truth core, mini-games as data (the constraint
layer), a curriculum-as-data DAG structured as a **spiral** (strands
recur at greater depth every year; nodes never do), a search verifier,
and a web play surface. Days 1–7 — "the Basics," the spiral's first lap
(the board and all six pieces, through piece values and two-piece
teamwork) — are real end-to-end. Band 2's core seams are OPEN
(`rules: "standard"` with the check-family goals, the deterministic
greedy opponent "Pip", danger-spotting, the `game` kind — decisions
D1–D6 in [docs/architecture-review.md](docs/architecture-review.md));
days 8–14 exist as sheet-first design specs awaiting authored data.
Zero LLM anywhere yet. Destination, the multi-year spiral shape, and
guiding lenses: [VISION.md](VISION.md).

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
- **Dev options.** `?dev=1` (sticky) mounts the backstage panel on an isolated
  dev learner profile; jumps/sandbox go through `stateWhere` + the normal serve
  gate — never bypass a gate or the kid's profile; DOM-absent when off (e2e-enforced).
- **Shipping gates:** empathy before scoping · owner verdict on scope ·
  operator walk before "done" · milestone-verify at close.

## Voice

Lesson content serves two users. The **child** (age 7): one concept per
lesson, short bursts, playful, praise the thinking over the answer,
stop while it's still fun. The **parent-coach** (likely a non-player):
every lesson runnable cold from its script. When touching a seam, adopt
the expert lens that owns it — table in [VISION.md](VISION.md).

**Being wrong or failing is never wrong:** never show red/error styling for a miss — it's a gentle nudge, and retrying is always one tap away.

**The no-shame contract extends through time** (binding on every future
author, human or agent): reviews are *visits*, never remediation; a
skill shown to the learner never visibly regresses; absence is never
punished — no streaks, no guilt, no "you lost your progress." When the
retention model resurfaces a fading skill, it arrives disguised as a
quick win, in character for a kid who just sat down to play.

## Quick reference

```bash
pnpm build:wasm         # Rust → WASM (after any crates/ change)
pnpm test:rust          # core: perft vs reference, scenarios playable
pnpm test               # WASM from Node, routing, verifier
pnpm verify:curriculum  # every authored exercise proven solvable
pnpm typecheck
pnpm dev                # play the Basics at http://localhost:5173
pnpm build && pnpm --filter @chess/web e2e   # the Basics in a real browser
```

Each is a CI gate — run the ones your change touches before declaring
done.

## Find your guide

| If you need to… | Read |
|---|---|
| Understand the destination, phases, whose lens leads | [VISION.md](VISION.md) |
| See architecture, decisions taken, open seams | [README.md](README.md) |
| Check current findings and next steps | [docs/architecture-review.md](docs/architecture-review.md) |
| Author or review lesson content | [.claude/table-of-contents.md](.claude/table-of-contents.md) (authoring checklist) + [docs/curriculum/](docs/curriculum/) day sheets |
| Add a curriculum day (tests → data → verify → sheet) | skill: [.claude/skills/create-curriculum-day/](.claude/skills/create-curriculum-day/SKILL.md) |
| Wire a day into the app (mechanics → copy → e2e → walk) | skill: [.claude/skills/build-day-experience/](.claude/skills/build-day-experience/SKILL.md) |

**Reference (on-demand):** [.claude/table-of-contents.md](.claude/table-of-contents.md)
— layout, gate→command map, authoring checklist, setup, known cleverness.
